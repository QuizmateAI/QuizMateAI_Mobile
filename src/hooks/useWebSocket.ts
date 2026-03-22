import {useCallback, useEffect, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Client, IMessage, StompSubscription} from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import {API_URL, WS_URL} from '@env';

type MaterialCallback = (payload: any) => void;
type ProgressCallback = (payload: any) => void;

type UseWebSocketOptions = {
  workspaceId?: number | string | null;
  groupId?: number | string | null;
  enabled?: boolean;
  onMaterialUploaded?: MaterialCallback;
  onMaterialDeleted?: MaterialCallback;
  onMaterialUpdated?: MaterialCallback;
  onProgress?: ProgressCallback;
};

const ACCESS_TOKEN_KEY = '@quizmate_access_token';

function normalizeStatus(status?: string) {
  if (!status) {
    return status;
  }

  const upper = String(status).toUpperCase();
  if (upper === 'PROCECCSING') {
    return 'PROCESSING';
  }
  if (upper === 'WARNED') {
    return 'WARN';
  }
  if (upper === 'REJECTED') {
    return 'REJECT';
  }
  return upper;
}

function extractStatusFromProgressEnvelope(payload: any) {
  return normalizeStatus(
    payload?.status ||
      payload?.final_status ||
      payload?.data?.status ||
      payload?.data?.final_status,
  );
}

function normalizeMaterialPayload(payload: any) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const normalizedStatus = normalizeStatus(payload.status || payload.final_status);
  return {
    ...payload,
    ...(normalizedStatus ? {status: normalizedStatus} : {}),
    ...(payload.final_status
      ? {final_status: normalizeStatus(payload.final_status)}
      : {}),
  };
}

type WebSocketTransport = 'sockjs' | 'native';

function buildWebSocketConfig(): {url: string; transport: WebSocketTransport} {
  const explicitWsUrl = String(WS_URL || '').trim();
  if (explicitWsUrl) {
    if (
      explicitWsUrl.startsWith('ws://') ||
      explicitWsUrl.startsWith('wss://')
    ) {
      return {
        url: explicitWsUrl,
        transport: 'native',
      };
    }

    return {
      url: explicitWsUrl,
      transport: 'sockjs',
    };
  }

  const baseUrl = API_URL || 'http://localhost:8080/api';
  try {
    const normalizedUrl = new URL(baseUrl);
    // Always resolve WS endpoint at server root to avoid API path variants (/api, /api/v1, ...).
    return {
      url: `${normalizedUrl.origin}/ws-quiz`,
      transport: 'sockjs',
    };
  } catch {
    return {
      url: 'http://localhost:8080/ws-quiz',
      transport: 'sockjs',
    };
  }
}

export default function useWebSocket({
  workspaceId,
  groupId,
  enabled = true,
  onMaterialUploaded,
  onMaterialDeleted,
  onMaterialUpdated,
  onProgress,
}: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);

  const stompClientRef = useRef<Client | null>(null);
  const subscriptionsRef = useRef<StompSubscription[]>([]);
  const callbackRefs = useRef({
    onMaterialUploaded,
    onMaterialDeleted,
    onMaterialUpdated,
    onProgress,
  });

  useEffect(() => {
    callbackRefs.current = {
      onMaterialUploaded,
      onMaterialDeleted,
      onMaterialUpdated,
      onProgress,
    };
  }, [onMaterialUploaded, onMaterialDeleted, onMaterialUpdated, onProgress]);

  const parseAndDispatchTopicMessage = useCallback((message: IMessage) => {
    let data: any = null;

    try {
      data = normalizeMaterialPayload(JSON.parse(message.body));
    } catch {
      data = {
        rawBody: message.body,
      };
    }

    const eventType = String(data?.type || '').toUpperCase();
    const eventStatus = normalizeStatus(data?.status || data?.final_status);

    if (
      eventType === 'UPLOADED' ||
      eventStatus === 'UPLOADED' ||
      eventStatus === 'ACTIVE'
    ) {
      setLastMessage({type: 'material:uploaded', data, timestamp: Date.now()});
      callbackRefs.current.onMaterialUploaded?.(data);
      return;
    }

    if (eventType === 'DELETED' || eventStatus === 'DELETED') {
      setLastMessage({type: 'material:deleted', data, timestamp: Date.now()});
      callbackRefs.current.onMaterialDeleted?.(data);
      return;
    }

    setLastMessage({type: 'material:updated', data, timestamp: Date.now()});
    callbackRefs.current.onMaterialUpdated?.(data);
  }, []);

  useEffect(() => {
    if (!enabled || (!workspaceId && !groupId)) {
      return;
    }

    let disposed = false;
    const wsConfig = buildWebSocketConfig();

    const connect = async () => {
      const token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
      const connectHeaders: Record<string, string> | undefined = token
        ? {Authorization: `Bearer ${token}`}
        : undefined;

      const stompClient = new Client({
        webSocketFactory: () =>
          wsConfig.transport === 'native'
            ? new WebSocket(wsConfig.url)
            : new SockJS(wsConfig.url),
        connectHeaders,
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        onConnect: () => {
          if (disposed) {
            return;
          }

          setIsConnected(true);

          const progressSub = stompClient.subscribe(
            '/user/queue/progress',
            message => {
              try {
                const response = JSON.parse(message.body);
                const status = extractStatusFromProgressEnvelope(response);
                const payload = normalizeMaterialPayload(
                  typeof response?.data === 'object' ? response.data : response,
                );
                const normalizedResponse = {
                  ...response,
                  ...(status ? {status} : {}),
                  data: payload,
                };

                setLastMessage({
                  type: 'progress',
                  data: normalizedResponse,
                  timestamp: Date.now(),
                });
                callbackRefs.current.onProgress?.(normalizedResponse);

                if (
                  status &&
                  ['ACTIVE', 'ERROR', 'WARN', 'REJECT', 'PROCESSING'].includes(
                    status,
                  )
                ) {
                  callbackRefs.current.onMaterialUpdated?.({...payload, status});
                }
              } catch {
                // Ignore malformed progress payload.
              }
            },
          );
          subscriptionsRef.current.push(progressSub);

          if (workspaceId) {
            const workspaceSub = stompClient.subscribe(
              `/topic/workspace/${workspaceId}/material`,
              parseAndDispatchTopicMessage,
            );
            subscriptionsRef.current.push(workspaceSub);
          }

          if (groupId) {
            const groupSub = stompClient.subscribe(
              `/topic/group/${groupId}/material`,
              parseAndDispatchTopicMessage,
            );
            subscriptionsRef.current.push(groupSub);
          }
        },
        onDisconnect: () => {
          if (!disposed) {
            setIsConnected(false);
          }
        },
        onStompError: () => {
          if (!disposed) {
            setIsConnected(false);
          }
        },
        onWebSocketError: () => {
          if (!disposed) {
            setIsConnected(false);
          }
        },
      });

      stompClientRef.current = stompClient;
      stompClient.activate();
    };

    connect();

    return () => {
      disposed = true;
      setIsConnected(false);

      subscriptionsRef.current.forEach(sub => {
        try {
          sub.unsubscribe();
        } catch {
          // No-op
        }
      });
      subscriptionsRef.current = [];

      const client = stompClientRef.current;
      stompClientRef.current = null;
      if (client?.active) {
        client.reconnectDelay = 0;
        client.deactivate();
      }
    };
  }, [enabled, workspaceId, groupId, parseAndDispatchTopicMessage]);

  const send = useCallback((destination: string, body: any) => {
    const client = stompClientRef.current;
    if (!client?.connected) {
      return false;
    }

    client.publish({
      destination: destination.startsWith('/app')
        ? destination
        : `/app${destination}`,
      body: JSON.stringify(body),
    });

    return true;
  }, []);

  return {
    isConnected,
    lastMessage,
    send,
    clientRef: stompClientRef,
  };
}

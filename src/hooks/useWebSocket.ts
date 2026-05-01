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

const ACCESS_TOKEN_KEY = '@quizmate_token';
const LEGACY_ACCESS_TOKEN_KEY = '@quizmate_access_token';

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

function toNumberOrNull(value: any) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function buildProcessingObjectFromProgressPayload(payload: any) {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const source =
    payload?.processingObject && typeof payload.processingObject === 'object'
      ? payload.processingObject
      : {};
  const taskType = String(
    source?.taskType ??
      source?.task_type ??
      data?.taskType ??
      data?.task_type ??
      payload?.taskType ??
      payload?.task_type ??
      '',
  ).toUpperCase();
  const workspaceId = toNumberOrNull(
    source?.workspaceId ??
      source?.workspace_id ??
      data?.workspaceId ??
      data?.workspace_id ??
      payload?.workspaceId ??
      payload?.workspace_id,
  );
  const roadmapId = toNumberOrNull(
    source?.roadmapId ??
      source?.roadmap_id ??
      data?.roadmapId ??
      data?.roadmap_id ??
      payload?.roadmapId ??
      payload?.roadmap_id,
  );
  const phaseId = toNumberOrNull(
    source?.phaseId ??
      source?.phase_id ??
      data?.phaseId ??
      data?.phase_id ??
      payload?.phaseId ??
      payload?.phase_id,
  );
  const knowledgeId = toNumberOrNull(
    source?.knowledgeId ??
      source?.knowledge_id ??
      data?.knowledgeId ??
      data?.knowledge_id ??
      payload?.knowledgeId ??
      payload?.knowledge_id,
  );
  const quizId = toNumberOrNull(
    source?.quizId ??
      source?.quiz_id ??
      data?.quizId ??
      data?.quiz_id ??
      payload?.quizId ??
      payload?.quiz_id,
  );
  const materialId = toNumberOrNull(
    source?.materialId ??
      source?.material_id ??
      data?.materialId ??
      data?.material_id ??
      payload?.materialId ??
      payload?.material_id,
  );

  const processingObject = {
    ...(taskType ? {taskType} : {}),
    ...(workspaceId ? {workspaceId} : {}),
    ...(roadmapId ? {roadmapId} : {}),
    ...(phaseId ? {phaseId} : {}),
    ...(knowledgeId ? {knowledgeId} : {}),
    ...(quizId ? {quizId} : {}),
    ...(materialId ? {materialId} : {}),
  };

  return Object.keys(processingObject).length > 0 ? processingObject : undefined;
}

function isRoadmapScopedProgressPayload(payload: any, processingObject: any = {}) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const status = String(
    payload?.status ?? payload?.final_status ?? data?.status ?? data?.final_status ?? '',
  ).toUpperCase();
  const taskType = String(
    processingObject?.taskType ??
      processingObject?.task_type ??
      data?.taskType ??
      data?.task_type ??
      payload?.taskType ??
      payload?.task_type ??
      '',
  ).toUpperCase();
  const roadmapId = toNumberOrNull(
    processingObject?.roadmapId ??
      processingObject?.roadmap_id ??
      data?.roadmapId ??
      data?.roadmap_id ??
      payload?.roadmapId ??
      payload?.roadmap_id,
  );
  const phaseId = toNumberOrNull(
    processingObject?.phaseId ??
      processingObject?.phase_id ??
      data?.phaseId ??
      data?.phase_id ??
      payload?.phaseId ??
      payload?.phase_id,
  );

  return Boolean(
    status.startsWith('ROADMAP_') ||
      taskType.includes('ROADMAP') ||
      roadmapId ||
      phaseId,
  );
}

type WebSocketTransport = 'sockjs' | 'native';

function buildWebSocketConfig(): {url: string; transport: WebSocketTransport} {
  const explicitWsUrl = String(WS_URL || '').trim();
  if (explicitWsUrl) {
    const normalizedUrl = explicitWsUrl.replace(/\/websocket$/i, '');
    if (normalizedUrl.startsWith('ws://')) {
      return {
        url: normalizedUrl.replace(/^ws:\/\//i, 'http://'),
        transport: 'sockjs',
      };
    }
    if (normalizedUrl.startsWith('wss://')) {
      return {
        url: normalizedUrl.replace(/^wss:\/\//i, 'https://'),
        transport: 'sockjs',
      };
    }

    return {
      url: normalizedUrl,
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
      const token =
        (await AsyncStorage.getItem(ACCESS_TOKEN_KEY)) ||
        (await AsyncStorage.getItem(LEGACY_ACCESS_TOKEN_KEY));
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
                const processingObject =
                  response?.processingObject && typeof response.processingObject === 'object'
                    ? response.processingObject
                    : buildProcessingObjectFromProgressPayload(response);
                const payload = normalizeMaterialPayload(
                  typeof response?.data === 'object' ? response.data : response,
                );
                const normalizedResponse = {
                  ...response,
                  ...(status ? {status} : {}),
                  ...(processingObject ? {processingObject} : {}),
                  data: payload,
                };
                const isRoadmapScoped = isRoadmapScopedProgressPayload(
                  normalizedResponse,
                  processingObject || {},
                );

                setLastMessage({
                  type: 'progress',
                  data: normalizedResponse,
                  timestamp: Date.now(),
                });
                callbackRefs.current.onProgress?.(normalizedResponse);

                if (
                  !isRoadmapScoped &&
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

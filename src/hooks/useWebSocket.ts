import {useCallback, useEffect, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Client, IMessage, StompSubscription} from '@stomp/stompjs';
import {API_URL, WS_URL} from '@env';

type MaterialCallback = (payload: any) => void;
type ProgressCallback = (payload: any) => void;
type RealtimeCallback = (payload: any) => void;

type UseWebSocketOptions = {
  workspaceId?: number | string | null;
  groupId?: number | string | null;
  enabled?: boolean;
  onMaterialUploaded?: MaterialCallback;
  onMaterialDeleted?: MaterialCallback;
  onMaterialUpdated?: MaterialCallback;
  onProgress?: ProgressCallback;
  onDiscussionUpdate?: RealtimeCallback;
  onChallengeUpdate?: RealtimeCallback;
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

const WS_LOG_PREFIX = '[WS]';

function wsLog(...args: any[]) {
  console.log(WS_LOG_PREFIX, ...args);
}
function wsWarn(...args: any[]) {
  console.warn(WS_LOG_PREFIX, ...args);
}
function wsError(...args: any[]) {
  console.error(WS_LOG_PREFIX, ...args);
}

function summarizeBody(body: string | undefined | null): string {
  if (!body) {
    return '<empty>';
  }
  if (body.length <= 240) {
    return body;
  }
  return `${body.slice(0, 240)}…(+${body.length - 240} chars)`;
}

function buildWebSocketUrl(): string {
  const explicitWsUrl = String(WS_URL || '').trim();
  if (explicitWsUrl) {
    let url = explicitWsUrl.replace(/\/websocket$/i, '');
    if (url.startsWith('http://')) {
      url = `ws://${url.slice('http://'.length)}`;
    } else if (url.startsWith('https://')) {
      url = `wss://${url.slice('https://'.length)}`;
    }
    return url;
  }

  const baseUrl = API_URL || 'http://localhost:8080/api';
  try {
    const parsed = new URL(baseUrl);
    const wsScheme = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsScheme}//${parsed.host}/ws-quiz-native`;
  } catch {
    return 'ws://localhost:8080/ws-quiz-native';
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
  onDiscussionUpdate,
  onChallengeUpdate,
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
    onDiscussionUpdate,
    onChallengeUpdate,
  });

  useEffect(() => {
    callbackRefs.current = {
      onMaterialUploaded,
      onMaterialDeleted,
      onMaterialUpdated,
      onProgress,
      onDiscussionUpdate,
      onChallengeUpdate,
    };
  }, [
    onMaterialUploaded,
    onMaterialDeleted,
    onMaterialUpdated,
    onProgress,
    onDiscussionUpdate,
    onChallengeUpdate,
  ]);

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
    const wsUrl = buildWebSocketUrl();
    wsLog('init', {wsUrl, workspaceId, groupId, enabled});

    const connect = async () => {
      const token =
        (await AsyncStorage.getItem(ACCESS_TOKEN_KEY)) ||
        (await AsyncStorage.getItem(LEGACY_ACCESS_TOKEN_KEY));
      const connectHeaders: Record<string, string> | undefined = token
        ? {Authorization: `Bearer ${token}`}
        : undefined;
      wsLog('connecting', {url: wsUrl, hasToken: Boolean(token)});

      const stompClient = new Client({
        webSocketFactory: () => {
          wsLog('opening WebSocket', wsUrl);
          const socket = new WebSocket(wsUrl);
          socket.onopen = () => wsLog('socket open');
          socket.onclose = ev =>
            wsLog('socket close', {code: ev?.code, reason: ev?.reason});
          return socket as any;
        },
        connectHeaders,
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        debug: msg => {
          if (__DEV__) {
            wsLog('stomp', msg);
          }
        },
        onConnect: frame => {
          if (disposed) {
            wsLog('onConnect ignored (disposed)');
            return;
          }

          wsLog('connected', {
            server: frame?.headers?.server,
            version: frame?.headers?.version,
            userId: frame?.headers?.['user-name'],
          });
          setIsConnected(true);

          wsLog('subscribe', '/user/queue/progress');
          const progressSub = stompClient.subscribe(
            '/user/queue/progress',
            message => {
              wsLog('recv /user/queue/progress', summarizeBody(message.body));
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
              } catch (err) {
                wsWarn('progress parse error', err);
              }
            },
          );
          subscriptionsRef.current.push(progressSub);

          if (workspaceId) {
            const workspaceTopic = `/topic/workspace/${workspaceId}/material`;
            wsLog('subscribe', workspaceTopic);
            const workspaceSub = stompClient.subscribe(
              workspaceTopic,
              message => {
                wsLog(`recv ${workspaceTopic}`, summarizeBody(message.body));
                parseAndDispatchTopicMessage(message);
              },
            );
            subscriptionsRef.current.push(workspaceSub);
          }

          if (groupId) {
            const groupTopic = `/topic/group/${groupId}/material`;
            wsLog('subscribe', groupTopic);
            const groupSub = stompClient.subscribe(groupTopic, message => {
              wsLog(`recv ${groupTopic}`, summarizeBody(message.body));
              parseAndDispatchTopicMessage(message);
            });
            subscriptionsRef.current.push(groupSub);
          }

          const workspaceTopicId = workspaceId || groupId;

          if (workspaceTopicId && callbackRefs.current.onDiscussionUpdate) {
            const discussionTopic = `/topic/workspace/${workspaceTopicId}/discussion`;
            wsLog('subscribe', discussionTopic);
            const discussionSub = stompClient.subscribe(
              discussionTopic,
              message => {
                wsLog(`recv ${discussionTopic}`, summarizeBody(message.body));
                try {
                  const data = JSON.parse(message.body);
                  setLastMessage({
                    type: 'discussion:update',
                    data,
                    timestamp: Date.now(),
                  });
                  callbackRefs.current.onDiscussionUpdate?.(data);
                } catch (err) {
                  wsWarn('discussion parse error', err);
                }
              },
            );
            subscriptionsRef.current.push(discussionSub);
          }

          if (workspaceTopicId && callbackRefs.current.onChallengeUpdate) {
            const challengeTopic = `/topic/workspace/${workspaceTopicId}/challenge`;
            wsLog('subscribe', challengeTopic);
            const challengeSub = stompClient.subscribe(
              challengeTopic,
              message => {
                wsLog(`recv ${challengeTopic}`, summarizeBody(message.body));
                try {
                  const data = JSON.parse(message.body);
                  setLastMessage({
                    type: 'challenge:update',
                    data,
                    timestamp: Date.now(),
                  });
                  callbackRefs.current.onChallengeUpdate?.(data);
                } catch (err) {
                  wsWarn('challenge parse error', err);
                }
              },
            );
            subscriptionsRef.current.push(challengeSub);
          }
        },
        onDisconnect: frame => {
          wsLog('disconnected', {receipt: frame?.headers?.['receipt-id']});
          if (!disposed) {
            setIsConnected(false);
          }
        },
        onStompError: frame => {
          wsError('STOMP error', {
            message: frame?.headers?.message,
            body: summarizeBody(frame?.body),
          });
          if (!disposed) {
            setIsConnected(false);
          }
        },
        onWebSocketError: ev => {
          wsError('WebSocket error', (ev as any)?.message ?? ev);
          if (!disposed) {
            setIsConnected(false);
          }
        },
        onWebSocketClose: ev => {
          wsLog('WebSocket closed', {code: ev?.code, reason: ev?.reason});
        },
      });

      stompClientRef.current = stompClient;
      stompClient.activate();
    };

    connect();

    return () => {
      wsLog('cleanup', {workspaceId, groupId});
      disposed = true;
      setIsConnected(false);

      subscriptionsRef.current.forEach(sub => {
        try {
          sub.unsubscribe();
        } catch (err) {
          wsWarn('unsubscribe error', err);
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
      wsWarn('send blocked — not connected', {destination});
      return false;
    }

    const finalDestination = destination.startsWith('/app')
      ? destination
      : `/app${destination}`;
    wsLog('send', finalDestination, summarizeBody(JSON.stringify(body)));
    client.publish({
      destination: finalDestination,
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

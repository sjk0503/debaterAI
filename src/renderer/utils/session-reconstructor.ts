import { DebateMessage, DebateStatus, DebateMode } from '../../shared/types';
import { SessionEvent } from '../../shared/session-types';

interface ReconstructResult {
  messages: DebateMessage[];
  finalStatus: DebateStatus;
  mode?: DebateMode;
}

export function reconstructMessages(events: SessionEvent[]): ReconstructResult {
  const messages: DebateMessage[] = [];
  let finalStatus: DebateStatus = 'idle';
  let mode: DebateMode | undefined;
  let currentAgentId: string | null = null;
  let currentAgentEvents: any[] = [];
  let currentAgentText = '';
  let currentAgentRole: 'claude' | 'codex' | null = null;
  let currentRound = 0;

  const flushAgent = () => {
    if (currentAgentRole && (currentAgentText || currentAgentEvents.length > 0)) {
      messages.push({
        id: `reconstructed-${messages.length}`,
        role: currentAgentRole,
        content: currentAgentText,
        timestamp: currentAgentEvents[0]?.timestamp || Date.now(),
        round: currentRound || undefined,
        agentEvents: currentAgentEvents.length > 0 ? [...currentAgentEvents] : undefined,
      });
    }
    currentAgentId = null;
    currentAgentEvents = [];
    currentAgentText = '';
    currentAgentRole = null;
  };

  for (const event of events) {
    const kind = (event.data as any)?.kind || event.type;

    switch (kind) {
      case 'session_start':
        mode = (event.data as any)?.mode;
        break;

      case 'user_message':
        flushAgent();
        messages.push({
          id: `reconstructed-${messages.length}`,
          role: 'user',
          content: (event.data as any)?.content || '',
          timestamp: event.timestamp,
        });
        break;

      case 'system_message':
        flushAgent();
        messages.push({
          id: `reconstructed-${messages.length}`,
          role: 'system',
          content: (event.data as any)?.content || '',
          timestamp: event.timestamp,
        });
        break;

      case 'agent_event': {
        const agentEvent = (event.data as any)?.event;
        if (!agentEvent) break;

        // If new agent, flush previous
        if (agentEvent.agentId !== currentAgentId) {
          flushAgent();
          currentAgentId = agentEvent.agentId;
          currentAgentRole = agentEvent.provider === 'codex' ? 'codex' : 'claude';
        }

        currentAgentEvents.push(agentEvent);

        // Accumulate text
        if (agentEvent.data?.kind === 'text_delta') {
          currentAgentText += agentEvent.data.text || '';
        } else if (agentEvent.data?.kind === 'text_done') {
          currentAgentText = agentEvent.data.fullText || currentAgentText;
        }
        break;
      }

      case 'status_change':
        finalStatus = (event.data as any)?.status || finalStatus;
        break;

      case 'consensus': {
        flushAgent();
        const agreement = (event.data as any)?.agreement || 'agree';
        const round = (event.data as any)?.round || 0;
        currentRound = round;
        messages.push({
          id: `reconstructed-${messages.length}`,
          role: 'system',
          content:
            agreement === 'agree'
              ? `✅ 합의 도달! (Round ${round})`
              : `⚡ ${agreement} (Round ${round})`,
          timestamp: event.timestamp,
          agreement,
        });
        break;
      }

      default:
        break;
    }
  }

  flushAgent(); // flush any remaining agent data

  return { messages, finalStatus, mode };
}

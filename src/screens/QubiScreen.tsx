import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeProvider';
import { AppColors, withAlpha } from '../theme/colors';
import { AppSpacing, GlassShadow } from '../theme/spacing';
import { fontFamilyFor } from '../theme/typography';
import { LiquidGlassCard } from '../components/LiquidGlass';
import { Pressable } from '../components/Pressable';
import { StrokeIcon } from '../components/AppIcons';
import { QubiMascot } from '../components/QubiMascot';
import { AppBadge, AppBadgeVariant } from '../components/SoftWidgets';
import { useNav } from './navContext';
import {
  useAppStore,
  selectWeeklyRate,
  plannedHabitFromArgs,
  type PlannedHabit,
} from '../state/appStore';
import {
  OpenRouterServiceInstance,
  AiMessage,
  AiToolCall,
  wantsToolCall,
  AiHttpException,
} from '../services/openRouter';
import {
  askQubi,
  generateRoutineFromIdealDay,
  questsToPlannedHabits,
  processQubiMessage,
  suggestedToHabitInput,
  type SuggestedQuest,
} from '../services/qubiService';

const SUGGESTIONS = [
  '🌅 What\'s your ideal day?',
  '📋 Generate my routine',
  'Optimize my routine',
  'What hurts my streak?',
] as const;

/** Free-text prompts that should trigger the structured routine generator. */
const ROUTINE_INTENT = /(ideal day|my routine|daily routine|plan my day|generate my|create.*routine|quests? for my day)/i;

const THINKING_PHRASES: Record<'greeting' | 'routine' | 'general', readonly string[]> = {
  greeting: ['Greeting user...', 'Preparing response...', 'Warming up Qubi engine...'],
  routine: [
    'Analyzing your ideal day schedule...',
    'Structuring optimal time slots...',
    'Calculating quest XP values...',
    'Matching optimal quest categories...',
  ],
  general: ['Thinking...', 'Processing your request...', 'Synthesizing answer...', 'Calculating daily XP momentum...'],
};

const GREETING_RE = /^(hey|hi+|hello+|yo|good\s*(morning|afternoon|evening)|sup)\b/i;
const ROUTINE_THINKING_RE = /(wake|day|schedul|routine|plan|quest|habit|morning|afternoon|evening|x p|xp)/i;

/** Stopwords stripped when deriving the "Thinking about …" topic. */
const TOPIC_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'what', 'whats', "what's", 'how', 'why', 'when',
  'can', 'you', 'your', 'yours', 'please', 'about', 'from', 'into', 'that',
  'this', 'with', 'have', 'has', 'are', 'was', 'were', 'will', 'would', 'should',
  'could', 'does', 'did', 'qubi', 'hey', 'hello', 'please',
]);

/** Derives up to 3 key terms from the prompt for the thinking banner. */
export function extractThinkingTopic(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !TOPIC_STOPWORDS.has(w));
  const topic = words.slice(0, 3).join(' ');
  if (topic.length === 0) return 'your request';
  return topic.length > 28 ? `${topic.slice(0, 28)}…` : topic;
}

function classifyIntent(prompt: string): keyof typeof THINKING_PHRASES {
  const lower = prompt.toLowerCase().trim();
  if (GREETING_RE.test(lower)) return 'greeting';
  if (ROUTINE_THINKING_RE.test(lower)) return 'routine';
  return 'general';
}

function prettyHour(code: string | undefined): string {
  if (code == null) return '—';
  const hour = Number.parseInt(code, 10);
  if (Number.isNaN(hour)) return code;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${ampm}`;
}

export default function QubiScreen({ onClose }: { onClose?: () => void }) {
  const { isDark, colors } = useTheme();
  const nav = useNav();

  const chat = useAppStore((s) => s.chat);
  const displayName = useAppStore((s) => s.displayName);
  const streak = useAppStore((s) => s.streak);
  const position = useAppStore((s) => s.position);
  const xp = useAppStore((s) => s.xp);
  const responses = useAppStore((s) => s.responses);
  const weeklyRate = useAppStore(selectWeeklyRate);

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [toolPlan, setToolPlan] = useState<AiToolCall | null>(null);
  const [suggestedQuests, setSuggestedQuests] = useState<SuggestedQuest[]>([]);
  const [thinkingPrompt, setThinkingPrompt] = useState('');

  const scrollRef = useRef<ScrollView | null>(null);
  const online = OpenRouterServiceInstance.isConfigured;
  const firstName = useMemo(() => displayName.split(' ')[0] ?? displayName, [displayName]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chat.length, streamingText, toolPlan != null, scrollToBottom]);

  /* ── Prompts ──────────────────────────────────────────────── */

  const buildSystemPrompt = useCallback((): string => {
    const r = responses;
    return [
      'You are Qubi, the friendly AI habit coach inside Qubi — a photo-verified habit app. Be concise: max 3 short sentences.',
      'User profile:',
      `- Name: ${displayName}`,
      `- Focus: ${r['focus'] ?? 'general'}`,
      `- Streak style: ${r['streak_commitment'] ?? '—'}`,
      `- Wake: ${prettyHour(r['wake_time'])} · Bedtime: ${prettyHour(r['bedtime'])}`,
      `- Daily budget: ${r['daily_time_budget'] ?? '30'} min`,
      `- Obstacle: ${r['obstacle'] ?? '—'}`,
      `- League: ${r['league'] ?? '—'} · Shield: ${r['shield'] === 'on' ? 'on' : 'off'}`,
      `- Mascot voice: ${r['mascot_voice'] ?? 'Peppy'}`,
      `- Targets: ${r['daily_quests'] ?? 3} quests/day`,
      `Current stats: ${xp} XP, ${streak}-day streak, #${position} in Silver, ${weeklyRate}% week completion.`,
      'Rules:',
      "- To build or change the user's routine, call the create_routine_plan tool with habits (title, category, frequency_days 0=Mon..6=Sun, time_of_day). The app shows an Approve & Add to Plan card.",
      '- Only call the tool when asked to build/change/optimize a routine.',
      '- All proofs are camera-captured; never suggest screenshots or gallery.',
      `- Write in the selected mascot voice (${r['mascot_voice'] ?? 'Peppy'}).`,
    ].join('\n');
  }, [responses, displayName, xp, streak, position, weeklyRate]);

  const buildRoutineSystemPrompt = useCallback(
    (idealDayDescription: string): string => {
      const r = responses;
      return [
        'You are Qubi, a habit coaching AI inside Qubi — a photo-verified habit app.',
        'The user described their ideal daily schedule or wants a personalized routine.',
        '',
        ...(idealDayDescription.length > 0
          ? ["User's ideal day description:", `"${idealDayDescription}"`, '']
          : []),
        'User profile:',
        `- Name: ${displayName}`,
        `- Focus: ${r['focus'] ?? 'general'}`,
        `- Streak style: ${r['streak_commitment'] ?? '—'}`,
        `- Wake: ${prettyHour(r['wake_time'])} · Bedtime: ${prettyHour(r['bedtime'])}`,
        `- Daily budget: ${r['daily_time_budget'] ?? '30'} min`,
        `- Obstacle: ${r['obstacle'] ?? '—'}`,
        '',
        'Create a structured Notion-style routine plan with time blocks, habit categories,',
        'target times, and XP values. Use the create_routine_plan tool to output the plan.',
        '',
        'After the tool call, respond with a brief confirmation like:',
        '"That sounds amazing! Here\'s your personalized Notion-style Routine & Task system."',
        'Keep your text reply short — 1-2 sentences max.',
      ].join('\n');
    },
    [responses, displayName],
  );

  const buildMessages = useCallback(
    (override?: Array<{ fromUser: boolean; text: string }>): AiMessage[] => {
      // NOTE: callers must pass the fresh store chat — the render-scope `chat`
      // is stale inside send() because addUserMessage runs just before.
      const source = override ?? chat;
      const history = source.length > 20 ? source.slice(source.length - 20) : source;
      return [
        { role: 'system', content: buildSystemPrompt() },
        ...history.map((m): AiMessage => ({ role: m.fromUser ? 'user' : 'assistant', content: m.text })),
      ];
    },
    [chat, buildSystemPrompt],
  );

  const planFromTool = useCallback((tool: AiToolCall): PlannedHabit[] => {
    const raw = Array.isArray(tool.args['habits']) ? (tool.args['habits'] as unknown[]) : [];
    return raw
      .filter((h): h is Record<string, unknown> => typeof h === 'object' && h != null)
      .map((h) => plannedHabitFromArgs(h));
  }, []);

  /* ── Chat actions ─────────────────────────────────────────── */

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (text.length === 0 || streaming) return;
      const app = useAppStore.getState();
      app.addUserMessage(text);
      setInput('');

      // Multi-task intent extraction: "wake up at 6:30 and run at 7" → cards.
      const parsed = processQubiMessage(text);
      if (parsed.suggestedQuests.length > 0) {
        setSuggestedQuests(parsed.suggestedQuests);
        useAppStore.getState().addAssistantMessage(parsed.text);
        scrollToBottom();
        return;
      }
      setThinkingPrompt(text);

      // Ideal-day / routine descriptions go to the structured quest generator.
      if (ROUTINE_INTENT.test(text)) {
        setStreaming(true);
        setStreamingText('');
        setToolPlan(null);
        scrollToBottom();
        try {
          const quests = await generateRoutineFromIdealDay(text);
          const added = await useAppStore.getState().applyAiPlan(questsToPlannedHabits(quests));
          useAppStore
            .getState()
            .addAssistantMessage(`Created ${added} new custom quest${added === 1 ? '' : 's'} for your day! ✨ Find them in the Tasks tab and snap photo proofs to bank XP.`);
        } catch {
          useAppStore.getState().addAssistantMessage('I couldn\'t build your routine just now — try again in a moment.');
        } finally {
          setStreaming(false);
          setStreamingText('');
          scrollToBottom();
        }
        return;
      }

      setStreaming(true);
      setStreamingText('');
      setToolPlan(null);

      let acc = '';
      let plan: AiToolCall | null = null;
      try {
        // Fresh store chat — includes the message added above (closure `chat`
        // would omit it and the model would never see the user's question).
        const messages = buildMessages(useAppStore.getState().chat);
        for await (const event of OpenRouterServiceInstance.streamChat(messages)) {
          if (event.kind === 'delta') {
            acc += event.text;
            setStreamingText(acc);
            scrollToBottom();
          } else if (event.kind === 'toolCall') {
            plan = event.toolCall;
            setToolPlan(event.toolCall);
            scrollToBottom();
          }
        }
      } catch (e) {
        // Graceful degradation: one-shot retry via the Qubi engine, then a
        // dynamic local coaching reply so the conversation never dead-ends.
        let message: string;
        try {
          const level = 1 + Math.floor(useAppStore.getState().xp / 500);
          const after = useAppStore.getState();
          message = await askQubi(text, {
            name: after.displayName.split(' ')[0] ?? after.displayName,
            level,
            streak: after.streak,
          });
        } catch {
          message =
            e instanceof AiHttpException ? e.userMessage : 'I hit a snag talking to my brain — please try again.';
        }
        useAppStore.getState().addAssistantMessage(message);
      } finally {
        if (plan == null) {
          const trimmed = acc.trim();
          if (trimmed.length > 0) {
            useAppStore.getState().addAssistantMessage(trimmed);
          } else {
            // Stream completed with no content — give the user a fallback reply.
            try {
              const level = 1 + Math.floor(useAppStore.getState().xp / 500);
              const fallback = await askQubi(text, {
                name: useAppStore.getState().displayName.split(' ')[0] ?? useAppStore.getState().displayName,
                level,
                streak: useAppStore.getState().streak,
              });
              useAppStore.getState().addAssistantMessage(fallback);
            } catch {
              useAppStore.getState().addAssistantMessage("I'm here! Try asking me something else.");
            }
          }
        }
        setStreaming(false);
        setStreamingText('');
        scrollToBottom();
      }
    },
    [streaming, buildMessages, scrollToBottom],
  );

  const generateRoutine = useCallback(
    async (idealDayDescription: string) => {
      if (streaming) return;
      const app = useAppStore.getState();
      app.addUserMessage(
        idealDayDescription.length > 0 ? `Here's my ideal day: ${idealDayDescription}` : 'Generate my routine',
      );
      setInput('');
      setStreaming(true);
      setStreamingText('');
      setToolPlan(null);

      const history = app.chat.slice(Math.max(0, app.chat.length - 10));
      const messages: AiMessage[] = [
        { role: 'system', content: buildRoutineSystemPrompt(idealDayDescription) },
        ...history.map((m): AiMessage => ({ role: m.fromUser ? 'user' : 'assistant', content: m.text })),
      ];

      try {
        const completion = await OpenRouterServiceInstance.complete({ messages });

        if (wantsToolCall(completion)) {
          const tool = completion.toolCalls![0];
          if (tool.name === 'create_routine_plan') {
            setToolPlan(tool);
            const replyText =
              completion.text != null && completion.text.trim().length > 0
                ? completion.text.trim()
                : "That sounds amazing! Here's your personalized Notion-style Routine & Task system. ✨";
            useAppStore
              .getState()
              .addAssistantMessage(`${replyText}\n\nYour Notion-style routine is now loaded in the Tasks tab! 📋✨`);
          }
        } else {
          const reply = completion.text?.trim() ?? "Got it! Here's your routine.";
          useAppStore.getState().addAssistantMessage(reply);
        }
      } catch (e) {
        const message =
          e instanceof AiHttpException ? e.userMessage : 'I hit a snag building your routine — please try again.';
        useAppStore.getState().addAssistantMessage(message);
      } finally {
        setStreaming(false);
        setStreamingText('');
        scrollToBottom();
      }
    },
    [streaming, buildRoutineSystemPrompt, scrollToBottom],
  );

  const approvePlan = useCallback(() => {
    if (toolPlan == null) return;
    const planned = planFromTool(toolPlan);
    void useAppStore.getState().applyAiPlan(planned);
    useAppStore
      .getState()
      .addAssistantMessage(
        `Added ${planned.length} quest${planned.length === 1 ? '' : 's'} to your plan. Snap a photo proof to bank your first +50 XP!`,
      );
    setToolPlan(null);
  }, [toolPlan, planFromTool]);

  const addSuggestedQuest = useCallback(
    async (q: SuggestedQuest) => {
      try {
        const input = suggestedToHabitInput(q);
        await useAppStore.getState().addHabit(input);
        useAppStore
          .getState()
          .addAssistantMessage(`Added “${q.title}” to your quests ✓ Snap a photo proof each day to keep the streak alive.`);
      } catch {
        nav.toast('Could not add the task — try again');
      }
      setSuggestedQuests((prev) => prev.filter((s) => s.title !== q.title));
      scrollToBottom();
    },
    [nav, scrollToBottom],
  );

  const addAllSuggested = useCallback(async () => {
    if (suggestedQuests.length === 0) return;
    const count = suggestedQuests.length;
    try {
      for (const q of suggestedQuests) {
        await useAppStore.getState().addHabit(suggestedToHabitInput(q));
      }
      useAppStore
        .getState()
        .addAssistantMessage(
          `Added ${count} quest${count === 1 ? '' : 's'} to your plan 🎯 Snap photo proofs daily to bank XP!`,
        );
    } catch {
      nav.toast('Could not add tasks — try again');
    }
    setSuggestedQuests([]);
    scrollToBottom();
  }, [suggestedQuests, nav, scrollToBottom]);

  const plannedHabits = useMemo(() => (toolPlan != null ? planFromTool(toolPlan) : []), [toolPlan, planFromTool]);

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <View style={styles.flex}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onTap={() => (onClose != null ? onClose() : nav.toast('Back'))}>
            <StrokeIcon name="chevronLeft" size={24} color={colors.ink} strokeWidth={2.2} />
          </Pressable>
          <View style={styles.headerCenter}>
            <View style={styles.row}>
              <Text
                style={[
                  styles.headerTitle,
                  { color: isDark ? AppColors.primaryFixedDim : AppColors.primaryDeep },
                ]}
              >
                Qubi AI
              </Text>
              <View style={{ width: 8 }} />
              <AppBadge
                label={online ? 'AI' : 'Offline'}
                variant={online ? AppBadgeVariant.success : AppBadgeVariant.gold}
                dense
              />
            </View>
            <View style={{ height: 4 }} />
            <Text style={[styles.headerSubtitle, { color: colors.muted }]}>Your streak coach, 24/7</Text>
          </View>
          {chat.length > 0 ? (
            <Pressable
              onTap={() => {
                useAppStore.getState().clearChats();
                setToolPlan(null);
              }}
            >
              <StrokeIcon name="trash" size={19} color={colors.muted} strokeWidth={2} />
            </Pressable>
          ) : (
            <View style={{ width: 19 }} />
          )}
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Greeting card */}
          <LiquidGlassCard radius={AppSpacing.radiusCard} padding={16}>
            <View style={styles.greetingAvatarWrap}>
              <LinearGradient
                colors={[withAlpha(AppColors.primary, 0.12), withAlpha(AppColors.primary, 0.12)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.greetingAvatar}
              >
                <QubiMascot size={72} bob={false} />
              </LinearGradient>
            </View>
            <View style={{ height: 14 }} />
            <View
              style={[
                styles.greetingBubble,
                {
                  backgroundColor: isDark ? withAlpha(AppColors.canvasDark, 0.5) : withAlpha(AppColors.canvas, 0.6),
                  borderColor: AppColors.glassEdge,
                },
              ]}
            >
              <Text style={[styles.greetingText, { color: colors.ink }]}>
                Hey {firstName}! You're on a {streak}-day streak. Snap your proofs to hold #{position}.
              </Text>
            </View>
            {!online ? (
              <>
                <View style={{ height: 12 }} />
                <View
                  style={[
                    styles.demoNote,
                    { backgroundColor: withAlpha(AppColors.gold, 0.1), borderColor: withAlpha(AppColors.gold, 0.5) },
                  ]}
                >
                  <StrokeIcon name="zap" size={15} color={AppColors.gold} strokeWidth={2.3} />
                  <View style={{ width: 8 }} />
                  <Text style={[styles.demoNoteText, { color: colors.muted }]}>
                    You're offline — connect to unlock smarter coaching.
                  </Text>
                </View>
              </>
            ) : null}
          </LiquidGlassCard>

          <View style={{ height: 14 }} />

          {/* Suggestion chips */}
          <View style={styles.chipsWrap}>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onTap={
                  streaming
                    ? () => {}
                    : () => {
                        if (s.startsWith('📋')) {
                          void generateRoutine(input);
                        } else {
                          void send(s);
                        }
                      }
                }
              >
                <View
                  style={[
                    styles.chip,
                    {
                      backgroundColor: withAlpha(AppColors.primary, 0.08),
                      borderColor: withAlpha(AppColors.primary, isDark ? 0.3 : 0.4),
                    },
                  ]}
                >
                  <StrokeIcon name="sparkle" size={12} color={AppColors.primary} strokeWidth={2.2} />
                  <View style={{ width: 6 }} />
                  <Text style={styles.chipText}>{s}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          <View style={{ height: 12 }} />

          {/* Chat bubbles */}
          {chat.map((message, i) => (
            <ChatBubble key={`${i}-${message.fromUser}`} text={message.text} fromUser={message.fromUser} onGoTasks={() => { useAppStore.getState().setActiveTab(1); if (onClose != null) onClose(); }} />
          ))}

          {/* Proactive multi-task suggestion cards */}
          {suggestedQuests.length > 0 ? (
            <View style={styles.suggestWrap}>
              <LiquidGlassCard
                radius={AppSpacing.radiusCard}
                padding={14}
                tint={withAlpha(AppColors.primary, 0.08)}
                borderColor={withAlpha(AppColors.primary, 0.5)}
              >
                {suggestedQuests.map((q, i) => (
                  <View key={`${q.title}-${i}`} style={[styles.suggestRow, { borderTopWidth: i === 0 ? 0 : 1, borderTopColor: AppColors.glassEdge }]}>
                    <View style={[styles.suggestIconTile, { backgroundColor: withAlpha(AppColors.primary, 0.12) }]}>
                      <StrokeIcon name="target" size={15} color={AppColors.primary} strokeWidth={2.3} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={2} style={[styles.suggestText, { color: colors.ink }]}>
                        {q.title}
                      </Text>
                      <Text numberOfLines={1} style={[styles.suggestMeta, { color: colors.muted }]}>
                        {q.category} · {q.timeOfDay} · +{q.xp} XP
                      </Text>
                    </View>
                    <View style={{ width: 8 }} />
                    <Pressable onTap={streaming ? () => {} : () => void addSuggestedQuest(q)} scale={0.94}>
                      <View style={[styles.suggestAddPill, { backgroundColor: withAlpha(AppColors.primary, 0.14), borderColor: withAlpha(AppColors.primary, 0.5) }]}>
                        <Text numberOfLines={1} style={styles.suggestAddText}>+ Add</Text>
                      </View>
                    </Pressable>
                  </View>
                ))}
                <View style={{ height: 12 }} />
                <Pressable onTap={streaming ? () => {} : () => void addAllSuggested()}>
                  <LinearGradient
                    colors={[AppColors.primary, AppColors.primaryDeep]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.suggestButton}
                  >
                    <StrokeIcon name="plus" size={15} color="#FFFFFF" strokeWidth={2.6} />
                    <View style={{ width: 6 }} />
                    <Text style={styles.suggestButtonText}>
                      Add All Tasks ({suggestedQuests.length})
                    </Text>
                  </LinearGradient>
                </Pressable>
              </LiquidGlassCard>
            </View>
          ) : null}

          {/* Streaming bubble */}
          {streaming || streamingText.length > 0 ? (
            <View style={styles.bubbleRowGap}>
              <QubiMascot size={30} bob={false} />
              <View style={{ width: 8 }} />
              <View
                style={[
                  styles.streamingBubble,
                  {
                    backgroundColor: isDark ? AppColors.glassDark : AppColors.glassLight,
                    borderColor: '#000000',
                  },
                ]}
              >
                {streamingText.length === 0 ? (
                  <QubiThinkingIndicator userPrompt={thinkingPrompt} />
                ) : (
                  <Text style={[styles.bubbleText, { color: colors.ink }]}>{streamingText}</Text>
                )}
              </View>
            </View>
          ) : null}

          {/* Plan proposal */}
          {toolPlan != null ? (
            <View style={styles.planWrap}>
              <LiquidGlassCard
                radius={AppSpacing.radiusCard}
                padding={16}
                tint={withAlpha(AppColors.primary, 0.08)}
                borderColor={AppColors.primary}
              >
                <View style={styles.row}>
                  <LinearGradient
                    colors={[AppColors.primary, AppColors.primaryDeep]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.planTile}
                  >
                    <StrokeIcon name="sparkle" size={18} color="#FFFFFF" strokeWidth={2.2} />
                  </LinearGradient>
                  <View style={{ width: 10 }} />
                  <Text style={[styles.planTitle, { color: colors.ink }]}>Routine plan proposed</Text>
                  <View style={{ flex: 1 }} />
                  <Pressable onTap={() => setToolPlan(null)}>
                    <StrokeIcon name="close" size={16} color={colors.muted} />
                  </Pressable>
                </View>
                <View style={{ height: 12 }} />
                {plannedHabits.map((h, i) => (
                  <View key={`${h.title}-${i}`} style={styles.planRowOuter}>
                    <View style={[styles.planRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }]}>
                      <StrokeIcon name="check" size={16} color={AppColors.success} strokeWidth={2.8} />
                      <View style={{ width: 8 }} />
                      <Text numberOfLines={1} style={[styles.planRowTitle, { color: colors.ink }]}>
                        {h.title}
                      </Text>
                      <View
                        style={[
                          styles.planTimeChip,
                          { backgroundColor: withAlpha(AppColors.primary, 0.08) },
                        ]}
                      >
                        <Text style={styles.planTimeText}>{h.timeOfDay}</Text>
                      </View>
                    </View>
                  </View>
                ))}
                <View style={{ height: 6 }} />
                <Pressable onTap={approvePlan}>
                  <LinearGradient
                    colors={[AppColors.primary, AppColors.primaryDeep]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.approveButton}
                  >
                    <Text style={styles.approveText}>Approve & Add to Plan</Text>
                  </LinearGradient>
                </Pressable>
              </LiquidGlassCard>
            </View>
          ) : null}

          <View style={{ height: 8 }} />
        </ScrollView>

        {/* Input bar */}
        <View
          style={[
            styles.inputBar,
            { backgroundColor: isDark ? '#0F1318' : '#FFFFFF' },
          ]}
        >
          <View style={styles.inputFieldWrap}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask Qubi anything…"
              placeholderTextColor={AppColors.muted}
              editable={!streaming}
              onSubmitEditing={() => void send(input)}
              returnKeyType="send"
              style={[styles.inputField, { backgroundColor: isDark ? AppColors.glassDark : '#F5F5F7', borderColor: AppColors.glassEdge, color: colors.ink }]}
            />
          </View>
          <View style={{ width: 10 }} />
          <Pressable onTap={streaming ? () => {} : () => void send(input)}>
            <LinearGradient
              colors={streaming ? [AppColors.muted, AppColors.muted] : [AppColors.primary, AppColors.primaryDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendButton}
            >
              {streaming ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <StrokeIcon name="arrowUp" size={22} color="#FFFFFF" strokeWidth={2.6} />
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ── Chat bubble ───────────────────────────────────────────── */

function ChatBubble({
  text,
  fromUser,
  onGoTasks,
}: {
  text: string;
  fromUser: boolean;
  onGoTasks: () => void;
}) {
  const { isDark, colors } = useTheme();
  const isRoutineSuccess = text.includes('Tasks tab! 📋✨');
  return (
    <View style={styles.bubbleOuter}>
      <View style={[styles.row, { justifyContent: fromUser ? 'flex-end' : 'flex-start', alignItems: 'flex-start' }]}>
        {!fromUser ? (
          <>
            <QubiMascot size={30} bob={false} />
            <View style={{ width: 8 }} />
          </>
        ) : null}
        <View
          style={[
            styles.bubble,
            fromUser ? styles.bubbleUser : styles.bubbleAssistant,
            fromUser
              ? { backgroundColor: AppColors.primary }
              : {
                  backgroundColor: isDark ? AppColors.glassDark : AppColors.glassLight,
                  borderWidth: 2.5,
                  borderColor: '#000000',
                },
            styles.userBubbleShadow,
          ]}
        >
          <Text style={[styles.bubbleText, { color: fromUser ? '#FFFFFF' : colors.ink }]}>{text}</Text>
        </View>
      </View>
      {isRoutineSuccess && !fromUser ? (
        <View style={styles.goTasksWrap}>
          <Pressable onTap={onGoTasks}>
            <LinearGradient
              colors={[AppColors.primary, AppColors.primaryDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.goTasksPill}
            >
              <Text style={styles.goTasksText}>📋 Go to Tasks</Text>
              <View style={{ width: 6 }} />
              <StrokeIcon name="chevronRight" size={12} color="#FFFFFF" strokeWidth={2.4} />
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/* ── Thinking indicator ────────────────────────────────────── */

/**
 * Dynamic thinking banner — "Thinking about [topic]…" derived from the user's
 * prompt key terms, with an animated ellipsis. Single Qubi avatar lives in the
 * parent streaming row, so this renders text-only (no double avatar).
 */
export function QubiThinkingIndicator({ userPrompt }: { userPrompt: string }) {
  const { colors } = useTheme();
  const topic = extractThinkingTopic(userPrompt);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setDots((i) => (i + 1) % 4), 450);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.thinkingBanner}>
      <Text numberOfLines={2} style={[styles.thinkingText, { color: colors.ink }]}>
        <Text>{`Thinking about ${topic}${'.'.repeat(dots)}`}</Text>
      </Text>
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  headerCenter: { flex: 1, paddingLeft: 6 },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontFamily: fontFamilyFor('w800'),
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: fontFamilyFor('w500'),
  },
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  greetingAvatarWrap: { alignItems: 'center' },
  greetingAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: withAlpha(AppColors.primary, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingBubble: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  greetingText: {
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 13.5 * 1.4,
    fontFamily: fontFamilyFor('w600'),
  },
  demoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.2,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  demoNoteText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 11.5 * 1.35,
    fontFamily: fontFamilyFor('w600'),
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: AppSpacing.radiusPill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: AppColors.primaryDeep,
    fontFamily: fontFamilyFor('w700'),
  },
  bubbleOuter: { marginBottom: 10 },
  bubbleRowGap: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bubbleUser: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 6,
    borderWidth: 2.5,
    borderColor: '#000000',
  },
  bubbleAssistant: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 18,
    borderWidth: 2.5,
    borderColor: '#000000',
  },
  userBubbleShadow: {
    shadowColor: '#000000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
    elevation: 0,
  },
  bubbleText: {
    fontSize: 13.5,
    lineHeight: 13.5 * 1.45,
    fontWeight: '500',
    fontFamily: fontFamilyFor('w500'),
  },
  streamingBubble: {
    flex: 1,
    maxWidth: '78%',
    borderWidth: 2.5,
    borderColor: '#000000',
    borderRadius: 18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    shadowColor: '#000000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
    elevation: 0,
  },
  goTasksWrap: { paddingLeft: 38, paddingTop: 8 },
  goTasksPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: AppSpacing.radiusPill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  goTasksText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fontFamilyFor('w700'),
  },
  planWrap: { marginBottom: 12 },
  planTile: {
    width: 36,
    height: 36,
    borderRadius: AppSpacing.radiusSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
    flexShrink: 1,
  },
  planRowOuter: { marginBottom: 8 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  planRowTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: fontFamilyFor('w700'),
  },
  planTimeChip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  planTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.primary,
    fontFamily: fontFamilyFor('w700'),
  },
  approveButton: {
    height: 50,
    borderRadius: AppSpacing.radiusSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
  },
  /* Proactive multi-task suggestion cards */
  suggestWrap: { marginBottom: 12 },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  suggestIconTile: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  suggestText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    fontFamily: fontFamilyFor('w700'),
  },
  suggestMeta: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
    fontWeight: '500',
    fontFamily: fontFamilyFor('w500'),
  },
  suggestAddPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
    flexShrink: 0,
  },
  suggestAddText: {
    color: AppColors.primary,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
  },
  suggestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppSpacing.radiusSoft,
    paddingVertical: 12,
  },
  suggestButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
  },
  /* Thinking indicator */
  thinkingBanner: {
    backgroundColor: '#FFC800',
    borderWidth: 2.5,
    borderColor: '#000000',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
    elevation: 0,
  },
  thinkingRow: { flexDirection: 'row', alignItems: 'center' },
  thinkingText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
    opacity: 0.55,
    fontWeight: '500',
    fontFamily: fontFamilyFor('w500'),
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    shadowColor: '#000000',
    shadowOpacity: Platform.OS === 'ios' ? 0.06 : 0,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: Platform.OS === 'android' ? 8 : 0,
  },
  inputFieldWrap: { flex: 1 },
  inputField: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 14.5,
    fontWeight: '600',
    fontFamily: fontFamilyFor('w600'),
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 13 : 9,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 3 },
  dotGap: { marginRight: 5 },
});
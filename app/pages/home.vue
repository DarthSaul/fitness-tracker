/** * Home dashboard page — shows weekly calendar strip, today's workout prompt,
and active program status. * Supports date selection to view scheduled workouts
and schedule new ones. */
<script setup lang="ts">
definePageMeta({ layout: 'app', header: { title: 'Home', emoji: '💪' } });

import type { ActiveWorkoutResponse } from '~/types/workout';
import type { HistoryResponse } from '~/types/history';

const router = useRouter();

const nowRef = ref<Date | null>(null);

onMounted(() => {
	nowRef.value = new Date();
	selectedDate.value = new Date(
		nowRef.value.getFullYear(),
		nowRef.value.getMonth(),
		nowRef.value.getDate(),
	);
});

const selectedDate = ref<Date>(new Date());

import { toDateString, isSameDay } from '~/utils/date';
import { findNextActiveExercise } from '~/utils/workout';

const isViewingToday = computed(() => {
	if (!nowRef.value) return true;
	return isSameDay(selectedDate.value, nowRef.value);
});

const {
	data: activeProgram,
	status: activeProgramStatus,
	error: activeProgramError,
} = useFetch<{
	id: string;
	programId: string;
	currentWeek: number;
	currentDay: number;
	program: {
		id: string;
		name: string;
		description: string | null;
		weeks: Array<{
			id: string;
			weekNumber: number;
			days: Array<{
				id: string;
				dayNumber: number;
				name: string | null;
				warmUp: string | null;
				exerciseGroups: Array<{
					id: string;
					type: 'STANDARD' | 'SUPERSET';
					restSeconds: number | null;
					exercises: Array<{
						id: string;
						order: number;
						exercise: { id: string; name: string };
						sets: Array<{
							id: string;
							setNumber: number;
							reps: number | null;
							weight: number | null;
							rpe: number | null;
							notes: string | null;
							effortTarget: string | null;
						}>;
					}>;
				}>;
			}>;
		}>;
	};
}>('/api/user-programs/active', {
	key: CACHE_KEYS.ACTIVE_PROGRAM,
	getCachedData: (key) => getCached(key),
});

const { data: sessionsData, status: sessionsStatus } = useFetch<{
	sessions: Array<{
		weekNumber: number;
		dayNumber: number;
		status: 'IN_PROGRESS' | 'COMPLETED';
	}>;
}>('/api/user-programs/active/sessions', {
	key: CACHE_KEYS.ACTIVE_SESSIONS,
	getCachedData: (key) => getCached(key),
	watch: [activeProgram],
});

// Scheduled workouts
const userProgramId = computed(() => activeProgram.value?.id);
const {
	scheduledWorkouts,
	scheduledDateStrings,
	getScheduleForDate,
	getScheduleForDay,
	scheduleWorkout,
	unscheduleWorkout,
	fetchScheduledWorkouts,
} = useScheduledWorkouts(userProgramId);

// Recent history strip — the five most recent sessions of either kind.
const { data: recentHistoryData, status: recentHistoryStatus } = useFetch<HistoryResponse>(
	'/api/history',
	{ query: { limit: 5 }, server: false },
);
const recentHistory = computed(() => recentHistoryData.value?.sessions ?? []);

// Completed-day markers for the calendar — completion instants across both
// session kinds, converted to local calendar days here so the day boundary
// respects the viewer's timezone (and DST) rather than the server's.
const { data: completedDatesData } = useFetch<{ completedAt: string[] }>(
	'/api/history/dates',
	{ server: false },
);
const completedDateStrings = computed(() =>
	Array.from(
		new Set(
			(completedDatesData.value?.completedAt ?? []).map((ts) =>
				toDateString(new Date(ts)),
			),
		),
	),
);

const programTotalDays = computed(() => {
	if (!activeProgram.value) return 0;
	return activeProgram.value.program.weeks.reduce(
		(sum, w) => sum + w.days.length,
		0,
	);
});

const programCompletedDays = computed(() => {
	if (!sessionsData.value) return 0;
	return sessionsData.value.sessions.filter(
		(s) => s.status === 'COMPLETED',
	).length;
});

const programProgressPercent = computed(() => {
	if (programTotalDays.value === 0) return 0;
	return Math.round(
		(programCompletedDays.value / programTotalDays.value) * 100,
	);
});

const isActiveProgramFetchError = computed(() => {
	return (
		activeProgramError.value &&
		activeProgramError.value.statusCode !== 404
	);
});

const formattedSelectedDate = computed(() => {
	if (!nowRef.value) return '';
	if (isViewingToday.value) {
		return `Today, ${selectedDate.value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
	}
	return selectedDate.value.toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'short',
		day: 'numeric',
	});
});

// Active workout session
const { data: activeWorkout, status: activeWorkoutStatus } =
	useFetch<ActiveWorkoutResponse>('/api/workouts/active', {
		key: CACHE_KEYS.ACTIVE_WORKOUT,
		getCachedData: (key) => getCached(key),
	});

// From `xl` the selected-date header renders inside the day card so the card
// and calendar tops align. The standalone <h2> stays for phones, and for the
// one desktop state with no card to host it: today with no active program.
// During loading it is hidden on desktop so the layout doesn't jump when the
// card (with its internal header) arrives.
const dateHeaderInCard = computed(() => {
	if (!isViewingToday.value) return true;
	if (
		activeWorkoutStatus.value === 'pending' ||
		activeProgramStatus.value === 'pending'
	) {
		return true;
	}
	return Boolean(activeWorkout.value?.session || activeProgram.value);
});

const {
	startWorkout,
	loading: startingWorkout,
	error: workoutError,
} = useWorkoutSession();

async function handleStartWorkout(): Promise<void> {
	try {
		const sessionId = await startWorkout();
		await router.push(`/workout/${sessionId}`);
	} catch {
		// Error is set in composable
	}
}

const previewOpen = ref(false);

const nextWorkoutDay = computed(() => {
	if (!activeProgram.value) return null;
	const week = activeProgram.value.program.weeks.find(
		(w) => w.weekNumber === activeProgram.value!.currentWeek,
	);
	return week?.days.find((d) => d.dayNumber === activeProgram.value!.currentDay) ?? null;
});

function resumeWorkout(): void {
	if (activeWorkout.value?.session) {
		router.push(`/workout/${activeWorkout.value.session.id}`);
	}
}

const activeWorkoutTotalSets = computed(() => {
	if (!activeWorkout.value?.day) return 0;
	return activeWorkout.value.day.exerciseGroups.reduce(
		(sum, g) =>
			sum +
			g.exercises.reduce((s, e) => s + e.sets.length, 0),
		0,
	);
});

const activeWorkoutCompletedSets = computed(() => {
	return activeWorkout.value?.session?.completedSets?.length ?? 0;
});

const activeWorkoutProgress = computed(() => {
	if (activeWorkoutTotalSets.value === 0) return 0;
	const percent = Math.round(
		(activeWorkoutCompletedSets.value /
			activeWorkoutTotalSets.value) *
			100,
	);
	return Math.max(0, Math.min(100, percent));
});

const activeWorkoutNextExercise = computed(() =>
	findNextActiveExercise(activeWorkout.value ?? null),
);

// Scheduled workout for the selected non-today date
const scheduledForSelectedDate = computed(() => {
	return getScheduleForDate(toDateString(selectedDate.value));
});

// For today view: check if next workout is scheduled for a future date
const nextWorkoutSchedule = computed(() => {
	if (!activeProgram.value) return null;
	return getScheduleForDay(
		activeProgram.value.currentWeek,
		activeProgram.value.currentDay,
	);
});

const nextWorkoutIsScheduledForFuture = computed(() => {
	if (!nextWorkoutSchedule.value || !nowRef.value) return false;
	const [y, m, d] = nextWorkoutSchedule.value.scheduledDate.split('-').map(Number) as [number, number, number];
	const scheduledDate = new Date(y, m - 1, d);
	const today = new Date(
		nowRef.value.getFullYear(),
		nowRef.value.getMonth(),
		nowRef.value.getDate(),
	);
	return scheduledDate > today;
});

const nextWorkoutScheduledLabel = computed(() => {
	if (!nextWorkoutSchedule.value) return '';
	const [y, m, d] = nextWorkoutSchedule.value.scheduledDate.split('-').map(Number) as [number, number, number];
	const date = new Date(y, m - 1, d);
	return `Scheduled for ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
});

const nextWorkoutExercises = computed(() => {
	if (!activeProgram.value) return [];
	const week = activeProgram.value.program.weeks.find(
		(w) => w.weekNumber === activeProgram.value!.currentWeek,
	);
	const day = week?.days.find(
		(d) => d.dayNumber === activeProgram.value!.currentDay,
	);
	if (!day) return [];
	return day.exerciseGroups.flatMap((g) =>
		g.exercises.map((e) => e.exercise.name),
	);
});

// Get the day name for a scheduled workout
function getDayName(weekNumber: number, dayNumber: number): string | null {
	if (!activeProgram.value) return null;
	const week = activeProgram.value.program.weeks.find(
		(w) => w.weekNumber === weekNumber,
	);
	const day = week?.days.find((d) => d.dayNumber === dayNumber);
	return day?.name ?? null;
}

// Schedule modal
const scheduleModalOpen = ref(false);

const completedDaysList = computed(() => {
	if (!sessionsData.value) return [];
	return sessionsData.value.sessions
		.filter((s) => s.status === 'COMPLETED')
		.map((s) => ({
			weekNumber: s.weekNumber,
			dayNumber: s.dayNumber,
		}));
});

const scheduleError = ref<string | null>(null);
const unscheduling = ref(false);

async function handleSchedule(
	weekNumber: number,
	dayNumber: number,
): Promise<void> {
	scheduleError.value = null;
	try {
		const dateStr = toDateString(selectedDate.value);
		await scheduleWorkout(weekNumber, dayNumber, dateStr);
		scheduleModalOpen.value = false;
	} catch (error) {
		scheduleError.value =
			(error as Error).message ||
			'Failed to schedule workout';
	}
}

async function handleUnschedule(): Promise<void> {
	if (!scheduledForSelectedDate.value || unscheduling.value) return;
	unscheduling.value = true;
	scheduleError.value = null;
	try {
		await unscheduleWorkout(scheduledForSelectedDate.value.id);
	} catch (error) {
		scheduleError.value =
			(error as Error).message ||
			'Failed to unschedule workout';
	} finally {
		unscheduling.value = false;
	}
}
</script>

<template>
	<!--
		Below `xl` the page is a flex column and the children flow in phone
		order via `order-*` (the column wrappers are display:contents there,
		so their children join the page flow). From `xl` each wrapper becomes
		a real block and the grid has exactly one row of two independent
		columns — no shared row tracks, so the calendar expanding into its
		month grid moves only its own column's history, never the left side.
	-->
	<div class="flex flex-col xl:grid xl:grid-cols-2 xl:items-start xl:gap-x-6">
		<!-- Right column: calendar + recent history -->
		<div class="contents xl:block xl:col-start-2 xl:row-start-1">
			<!-- Calendar — a week strip, expandable to a month grid -->
			<CalendarStrip
				v-model="selectedDate"
				:loading="!nowRef"
				:scheduled-dates="scheduledDateStrings"
				:completed-dates="completedDateStrings"
				class="order-1 mb-3 xl:mb-0"
			/>

			<!-- Recent history -->
			<section class="order-5 mt-6 space-y-2">
				<p class="px-1 text-caption font-semibold uppercase text-label-secondary">
					History
				</p>
				<AppSkeleton v-if="recentHistoryStatus === 'pending'" :height="64" :count="3" />
				<div
					v-else-if="recentHistory.length > 0"
					class="divide-y divide-separator overflow-hidden rounded-card bg-surface"
				>
					<HistoryRow v-for="entry in recentHistory" :key="entry.id" :entry="entry" />
				</div>
				<!-- A failed fetch must not claim the user has never trained -->
				<p
					v-else-if="recentHistoryStatus === 'error'"
					class="rounded-card bg-surface px-4 py-6 text-center text-subheadline text-label-secondary"
				>
					Couldn't load recent workouts.
				</p>
				<p v-else class="rounded-card bg-surface px-4 py-6 text-center text-subheadline text-label-secondary">
					Finish a workout and it will show up here.
				</p>
				<NuxtLink to="/history" class="block px-1 pt-1 text-subheadline font-medium text-tint">
					View all history →
				</NuxtLink>
			</section>
		</div>

		<!-- Left column: today's card, Strength on the Go, program row -->
		<div class="contents xl:block xl:col-start-1 xl:row-start-1">
			<!-- Today: date header + the selected day's card. From `xl` the header
			     renders inside the card instead (so the card and calendar tops
			     align); this standalone one covers phones and the cardless state. -->
			<div class="order-2">
				<h2
					class="mb-3 text-lg font-semibold text-label"
					:class="dateHeaderInCard ? 'xl:hidden' : ''"
				>
					{{ formattedSelectedDate }}
				</h2>
				<!-- ===== TODAY VIEW ===== -->
				<template v-if="isViewingToday">
					<!-- Workout card skeleton -->
					<AppSkeleton
						v-if="
							activeWorkoutStatus === 'pending' ||
							activeProgramStatus === 'pending'
						"
						:height="220"
					/>

					<!-- Resume workout with progress bar -->
					<div
						v-else-if="activeWorkout?.session"
						class="flex overflow-hidden rounded-card border border-separator min-h-[220px] cursor-pointer"
						tabindex="0"
						role="button"
						:aria-label="`Resume workout: Week ${activeWorkout.session.weekNumber}, Day ${activeWorkout.session.dayNumber}`"
						@click="resumeWorkout"
						@keydown.enter="resumeWorkout"
						@keydown.space.prevent="resumeWorkout"
					>
						<div
							class="w-3 shrink-0 bg-gradient-to-b from-ios-purple to-ios-pink"
						/>
						<UCard
							v-wave
							class="flex-1 min-w-0 rounded-none border-0"
							:ui="{ body: 'p-4 flex flex-col h-full' }"
						>
							<h2 class="hidden text-lg font-semibold text-label xl:mb-4 xl:block">
								{{ formattedSelectedDate }}
							</h2>
							<p class="text-sm text-label-secondary mb-1">In progress</p>
							<p class="font-medium text-label">
								Week
								{{
									activeWorkout.session
										.weekNumber
								}}
								· Day
								{{
									activeWorkout.session
										.dayNumber
								}}
							</p>
							<div class="mt-3 space-y-1">
								<div
									class="h-3 overflow-hidden rounded-full bg-fill"
								>
									<div
										class="h-full rounded-full bg-tint transition-all duration-300"
										:style="{
											width: `${activeWorkoutProgress}%`,
										}"
									/>
								</div>
								<p
									class="text-xs text-label-secondary"
								>
									{{
										activeWorkoutCompletedSets
									}}
									/
									{{
										activeWorkoutTotalSets
									}}
									sets
								</p>
							</div>
							<ul v-if="activeWorkoutNextExercise" class="mt-2 space-y-1">
								<li class="flex items-center gap-2 text-sm text-label">
									<span class="size-1.5 shrink-0 rounded-full bg-tint" />
									Next: {{ activeWorkoutNextExercise }}
								</li>
							</ul>
							<span
								class="mt-auto flex items-center justify-between gap-1 rounded-chip bg-ios-green/20 px-2.5 py-1 text-sm font-medium text-ios-green"
							>
								Resume workout
								<UIcon
									name="i-lucide-chevron-right"
									class="size-4.5"
								/>
							</span>
						</UCard>
					</div>

					<!-- Next day / Start workout card -->
					<div
						v-else-if="activeProgram"
						class="flex overflow-hidden rounded-card border border-separator min-h-[220px]"
						:class="
							startingWorkout
								? 'opacity-70 cursor-wait'
								: 'cursor-pointer'
						"
						:tabindex="startingWorkout ? -1 : 0"
						role="button"
						:aria-label="`Start workout: Week ${activeProgram.currentWeek}, Day ${activeProgram.currentDay}`"
						:aria-busy="startingWorkout"
						:aria-disabled="startingWorkout"
						@click="
							!startingWorkout && handleStartWorkout()
						"
						@keydown.enter="
							!startingWorkout && handleStartWorkout()
						"
						@keydown.space.prevent="
							!startingWorkout && handleStartWorkout()
						"
					>
						<div
							class="w-3 shrink-0 bg-gradient-to-b from-ios-purple to-ios-pink"
						/>
						<UCard
							v-wave
							class="flex-1 min-w-0 rounded-none border-0"
							:ui="{ body: 'p-4 flex flex-col h-full' }"
						>
							<h2 class="hidden text-lg font-semibold text-label xl:mb-4 xl:block">
								{{ formattedSelectedDate }}
							</h2>
							<p
								class="text-sm text-label-secondary mb-1"
							>
								{{
									nextWorkoutIsScheduledForFuture
										? nextWorkoutScheduledLabel
										: 'Next up'
								}}
							</p>
							<p
								class="font-semibold text-label"
							>
								Week
								{{
									activeProgram.currentWeek
								}}
								· Day
								{{
									activeProgram.currentDay
								}}
							</p>
							<!-- Exercise preview -->
							<ul
								v-if="nextWorkoutExercises.length"
								class="mt-2 space-y-1"
							>
								<li
									v-for="(name, i) in nextWorkoutExercises.slice(0, 3)"
									:key="i"
									class="flex items-center gap-2 text-sm text-label"
								>
									<span
										class="size-1.5 shrink-0 rounded-full bg-tint"
									/>
									{{ name }}
								</li>
								<li
									v-if="nextWorkoutExercises.length > 3"
									class="text-xs text-label-secondary mb-1"
								>
									+{{ nextWorkoutExercises.length - 3 }} more
								</li>
							</ul>
							<span
								class="mt-auto flex items-center justify-between gap-1 rounded-chip bg-ios-green/20 px-2.5 py-1 text-sm font-medium text-ios-green"
							>
								{{
									nextWorkoutIsScheduledForFuture
										? 'Start next workout early'
										: 'Start next workout'
								}}
								<UIcon
									v-if="startingWorkout"
									name="i-lucide-loader-circle"
									class="size-4.5 animate-spin"
								/>
								<UIcon
									v-else
									name="i-lucide-chevron-right"
									class="size-4.5"
								/>
							</span>
							<button
								class="mt-2 flex w-full items-center justify-between gap-1 rounded-chip bg-label-secondary/15 px-2.5 py-1 text-sm font-medium text-label transition-colors hover:bg-label-secondary/15"
								type="button"
								aria-label="Preview next workout"
								@click.stop="previewOpen = true"
								@keydown.enter.stop.prevent="previewOpen = true"
								@keydown.space.stop.prevent="previewOpen = true"
							>
								Preview
								<UIcon
									name="i-lucide-eye"
									class="size-4.5"
								/>
							</button>
							<UAlert
								v-if="workoutError"
								color="error"
								variant="subtle"
								:title="workoutError"
								class="mt-3"
							/>
						</UCard>
					</div>

					<!--
						No card when there is no active program: this slot used to
						render an empty "Next day in program" label, which said
						nothing and sat directly above the real "No active programs
						yet" card that owns this state.
					-->
				</template>

				<!-- ===== NON-TODAY VIEW ===== -->
				<template v-else>
					<!-- Scheduled workout for this date -->
					<div
						v-if="scheduledForSelectedDate"
						class="flex overflow-hidden rounded-card border border-separator"
					>
						<div
							class="w-3 shrink-0 bg-gradient-to-b from-ios-purple to-ios-pink"
						/>
						<UCard
							class="flex-1 min-w-0 rounded-none border-0 py-1"
						>
							<h2 class="hidden text-lg font-semibold text-label xl:mb-4 xl:block">
								{{ formattedSelectedDate }}
							</h2>
							<p class="text-sm text-label-secondary">
								Scheduled
							</p>
							<p class="font-semibold text-label">
								Week
								{{
									scheduledForSelectedDate.weekNumber
								}}, Day
								{{
									scheduledForSelectedDate.dayNumber
								}}
								<span
									v-if="
										getDayName(
											scheduledForSelectedDate.weekNumber,
											scheduledForSelectedDate.dayNumber,
										)
									"
									class="font-normal text-label-secondary"
								>
									—
									{{
										getDayName(
											scheduledForSelectedDate.weekNumber,
											scheduledForSelectedDate.dayNumber,
										)
									}}
								</span>
							</p>
							<button
								class="mt-3 flex items-center justify-between gap-1 rounded-chip bg-label-secondary/15 px-2.5 py-1 text-sm font-medium text-label transition-colors hover:bg-label-secondary/15"
								:disabled="unscheduling"
								:class="
									unscheduling
										? 'w-full opacity-50 cursor-wait'
										: 'w-full'
								"
								@click="handleUnschedule"
							>
								<template v-if="unscheduling">
									<UIcon
										name="i-lucide-loader-circle"
										class="size-4 animate-spin"
									/>
									Unscheduling…
								</template>
								<template v-else>
									Unschedule
									<UIcon
										name="i-lucide-x"
										class="size-4"
									/>
								</template>
							</button>
							<UAlert
								v-if="scheduleError"
								color="error"
								variant="subtle"
								:title="scheduleError"
								class="mt-3"
							/>
						</UCard>
					</div>

					<!-- No workout scheduled for this date -->
					<div
						v-else-if="activeProgram"
						class="flex overflow-hidden rounded-card border border-separator min-h-[220px]"
					>
						<div
							class="w-3 shrink-0 bg-gradient-to-b from-ios-purple to-ios-pink"
						/>
						<UCard
							class="flex-1 min-w-0 rounded-none border-0"
							:ui="{ body: 'p-4 flex flex-col h-full' }"
						>
							<h2 class="hidden text-lg font-semibold text-label xl:mb-4 xl:block">
								{{ formattedSelectedDate }}
							</h2>
							<p class="text-sm text-label-secondary">
								Scheduled
							</p>
							<p class="font-semibold text-label">
								No workout scheduled
							</p>
							<button
								class="mt-auto flex w-full items-center justify-between gap-1 rounded-chip bg-tint/15 px-2.5 py-1 text-sm font-medium text-tint transition-colors hover:bg-tint/25"
								@click="scheduleModalOpen = true"
							>
								Schedule a workout
								<UIcon
									name="i-lucide-plus"
									class="size-4.5"
								/>
							</button>
						</UCard>
					</div>

					<!-- No active program -->
					<UCard
						v-else-if="activeProgramStatus !== 'pending'"
						class="py-1"
					>
						<h2 class="hidden text-lg font-semibold text-label xl:mb-4 xl:block">
							{{ formattedSelectedDate }}
						</h2>
						<div class="text-label-secondary">
							No active program
						</div>
					</UCard>
				</template>
			</div>

			<!-- Strength on the Go -->
			<NuxtLink
				v-wave
				to="/standalone-workouts"
				class="order-4 mt-6 block"
			>
				<AppCard>
					<div class="flex items-center gap-3">
						<span class="flex size-10 shrink-0 items-center justify-center rounded-tile bg-gradient-to-b from-ios-purple to-ios-pink">
							<UIcon name="i-lucide-zap" class="size-5 text-white" />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block text-headline">Strength on the Go</span>
							<span class="block text-caption text-label-secondary">Quick 30–45 minute workouts, any time</span>
						</span>
						<span class="flex shrink-0 items-center gap-0.5 rounded-full bg-tint/15 px-2.5 py-1 text-caption font-semibold text-tint">
							Browse
							<UIcon name="i-lucide-chevron-right" class="size-3" />
						</span>
					</div>
				</AppCard>
			</NuxtLink>

			<!-- Manage Program row -->
			<div class="order-3 mt-6 space-y-6">
				<!-- Loading -->
				<div
					v-if="
						activeProgramStatus === 'pending' ||
						sessionsStatus === 'pending'
					"
					class="grid grid-cols-[1fr_3fr] gap-3"
				>
					<AppSkeleton :height="112" />
					<AppSkeleton :height="112" />
				</div>

				<!-- Fetch error (non-404) -->
				<UCard v-else-if="isActiveProgramFetchError" class="py-1">
					<div class="text-center text-ios-red">
						<p>Failed to load program.</p>
						<p class="mt-1 text-sm">
							Please try again later.
						</p>
					</div>
				</UCard>

				<!-- Active program -->
				<div
					v-else-if="activeProgram"
					class="grid grid-cols-[1fr_3fr] gap-3"
				>
					<!-- Circular progress card -->
					<UCard class="py-0">
						<div
							class="flex flex-col items-center justify-center -my-1"
						>
							<svg
								class="size-16"
								viewBox="0 0 64 64"
							>
								<!-- Background circle -->
								<circle
									cx="32"
									cy="32"
									r="28"
									fill="none"
									stroke="currentColor"
									stroke-width="5"
									class="text-label-tertiary"
								/>
								<!-- Progress arc -->
								<circle
									cx="32"
									cy="32"
									r="28"
									fill="none"
									stroke="currentColor"
									stroke-width="5"
									stroke-linecap="round"
									class="text-tint transition-all duration-500"
									:stroke-dasharray="`${programProgressPercent * 1.7593} 175.93`"
									transform="rotate(-90 32 32)"
								/>
								<text
									x="32"
									y="34"
									text-anchor="middle"
									dominant-baseline="middle"
									fill="white"
									font-size="13"
									font-weight="600"
								>
									{{
										programCompletedDays
									}}/{{
										programTotalDays
									}}
								</text>
							</svg>
						</div>
					</UCard>

					<!-- Program info card -->
					<UCard
						v-wave
						class="overflow-hidden py-1 cursor-pointer"
					>
						<NuxtLink
							to="/program"
							class="flex h-full items-end justify-between"
						>
							<div>
								<p
									class="text-sm text-label-secondary"
								>
									My Program
								</p>
								<h4
									class="font-semibold text-label"
								>
									{{
										activeProgram
											.program
											.name
									}}
								</h4>
							</div>
							<span
								class="flex items-center gap-1 rounded-full bg-tint/15 px-2.5 py-0.5 text-xs font-medium text-tint"
							>
								Manage
								<UIcon
									name="i-lucide-chevron-right"
									class="size-3.5"
								/>
							</span>
						</NuxtLink>
					</UCard>
				</div>

				<!-- No active program -->
				<UCard v-else class="py-1">
					<div class="text-center text-label-secondary">
						<p>No active programs yet.</p>
						<NuxtLink
							to="/programs"
							class="mt-1 inline-block text-sm text-tint hover:text-tint"
						>
							Browse programs to get started.
						</NuxtLink>
					</div>
				</UCard>

			</div>
		</div>

		<!-- Schedule workout modal -->
		<ScheduleWorkoutModal
			v-if="activeProgram"
			v-model:open="scheduleModalOpen"
			:target-date="selectedDate"
			:program="activeProgram.program"
			:scheduled-workouts="scheduledWorkouts"
			:completed-days="completedDaysList"
			:error="scheduleError"
			@schedule="handleSchedule"
		/>

		<WorkoutPreviewDrawer
			:open="previewOpen"
			:day="nextWorkoutDay"
			:week-number="activeProgram?.currentWeek ?? 0"
			:day-number="activeProgram?.currentDay ?? 0"
			@close="previewOpen = false"
		/>
	</div>
</template>

/** * Split hero: copy and CTAs on the left, the sign-in artwork framed on the * right. * * The art is a 940px-wide
portrait, so it is used near its native aspect * inside a 440px frame — one 1x and one 2x source, no upscaling. Bleeding
it * full-width across the frame, as the login screen does, would visibly soften * it on a retina laptop. * * The card
is the app's own AppCard with its brand rail, so the marketing page * opens on the same object the product is built
from. */
<template>
	<section class="mx-auto w-full max-w-frame px-6 py-16 lg:px-10 lg:py-24">
		<div class="grid items-start gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)] md:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-12">
			<div class="max-w-2xl">
				<p class="text-footnote font-semibold tracking-widest uppercase text-ios-purple">
					Structured strength training
				</p>

				<h1 class="mt-3 text-large-title text-label sm:text-display lg:text-display-lg">
					Follow plans you'll love. Log workouts with ease. Track your gains.
				</h1>

				<p class="mt-5 text-body text-label-secondary sm:text-title2 sm:font-normal">
					A workout tracker for people following a real program — weeks, days and progressions already laid out. Pick
					one, log your sets, and let it remember exactly where you left off.
				</p>

				<!-- One row, equal columns: the badge's fixed artwork sets the width
				     (w-fit) and the button stretches to match it. Sign in lives in the
				     header, so the hero pitches new users only. -->
				<div class="mt-8 grid w-fit grid-cols-2 gap-3">
					<UButton to="/login?signup=1" size="xl" color="primary" label="Get started" block />
					<MarketingAppStoreBadge />
				</div>
			</div>

			<AppCard rail="brand" :padded="false" class="mx-auto w-full max-w-[320px] md:max-w-[300px] lg:max-w-[440px]">
				<!-- Explicit dimensions + aspect-ratio: this page gets Lighthoused. -->
				<img
					src="/img/login-hero.jpg"
					srcset="/img/login-hero.jpg 640w, /img/login-hero@2x.jpg 940w"
					sizes="(min-width: 1024px) 440px, (min-width: 768px) 300px, 100vw"
					width="640"
					height="1137"
					alt="Two lifters mid-set in a gym"
					class="block w-full object-cover"
					style="aspect-ratio: 640 / 1137"
					fetchpriority="high"
				/>
			</AppCard>
		</div>
	</section>
</template>

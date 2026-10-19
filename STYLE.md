# Fractional Forge public style

This file describes the colours, type and motion used on the public Fractional Forge pages (the homepage and the four service pages). It is the written companion to `src/styles/ff-tokens.css`.

## Colours

The page is a warm off-white, not a cold studio white. Body text is a very dark navy. Secondary text is a softer slate, and captions use a muted grey. Lines and hairline borders are a warm stone colour.

The accent is rust: a brown-red used for primary buttons, links, ticks and the italic word in the homepage headline. A pale rust wash sits behind highlights. Habitat Draft uses a moss green for its own accent, so that service is distinct without introducing a new palette.

Inverted bands (the founder strip, some call-to-action panels) use a navy ground with light text, so they still read as a dark panel when the rest of the page is light.

In dark mode the paper becomes a deep navy, body text becomes a warm off-white, rust lightens so it still meets contrast on the dark ground, and cards are a step lighter than the page so they separate from the background.

Primary button text is white on rust in light mode, and the dark navy on the lighter rust in dark mode. Both combinations meet the 4.5:1 contrast ratio for ordinary text.

Do not use the old CentaurOS international orange or electric blue on these public pages.

## Type

Headlines use Fraunces, a serif with a slightly soft optical size, self-hosted as roman and italic. The italic is reserved for a short accent in a headline (on the homepage, the words "at a fixed price"). Body copy, navigation, buttons and labels use Inter, also self-hosted. Both files are Latin-subset variable fonts from 400 to 700.

Do not load Outfit, Playfair Display or JetBrains Mono on these public pages. Those faces belong to the signed-in app.

A short scale, from the homepage:

- Eyebrow labels: about 12 to 13 px, bold, wide letter-spacing, rust
- Body: 16 to 18 px
- Lede under the headline: 18 px
- Service names: about 28 px in Fraunces
- The homepage headline: from 40 px up to 64 px, depending on the viewport
- Do not set public UI type below 11 px

## Motion

Motion is a corporate 200 and 300 millisecond scale. Entrances ease out (cubic-bezier 0.05, 0.7, 0.1, 1). Ordinary hovers use a standard easing (cubic-bezier 0.2, 0, 0, 1) over 200 ms. Exits run at about 70 percent of the entrance time.

The homepage hero panel is one `seek(t)` function: a 0.6 second setup, a 2.6 second build, then a hold, in three scenes of six seconds. It pauses when the browser tab is hidden. When the visitor has asked for reduced motion, the panel shows a finished still of the current scene; the tabs still change the scene, with no running animation.

Hover lifts on cards and buttons are 1 to 3 pixels, over 200 ms, and do not move when the visitor has asked for reduced motion.

"Three steps, no calls" uses native CSS scroll-driven animation (`animation-timeline: view()`): a progress line fills and each step settles as it enters. Unsupported browsers and reduced motion see the finished static state. Total settle time is 200 ms.

Each service page has an explainer film with controls, a poster, default-on captions and `preload="none"`, so no video bytes load before play. Films do not autoplay. Short looping clips of the hero panel are share assets only; they are not embedded on the pages.

There is no looping decoration on the rest of the page.

<script setup lang="ts">
/**
 * TransitionFade - Reusable fade transition wrapper component
 *
 * Uses the standardized CONSTANTS.TRANSITIONS definitions to eliminate
 * duplicated transition class configurations across components.
 *
 * @example
 * <TransitionFade>
 *   <div v-if="visible">Content</div>
 * </TransitionFade>
 *
 * @example With scale effect
 * <TransitionFade type="scale">
 *   <Modal v-if="open" />
 * </TransitionFade>
 */

import { CONSTANTS } from '../../constants/app';

interface Props {
  /**
   * Transition type to use
   * - fade: Simple opacity fade (default)
   * - scale: Fade with scale effect (good for modals)
   * - slideUp: Fade with upward slide (good for toasts/panels)
   * - slideDown: Fade with downward slide (good for notifications/error banners)
   * - collapse: Fade with height animation (good for accordions)
   */
  type?: 'fade' | 'scale' | 'slideUp' | 'slideDown' | 'collapse';
}

const props = withDefaults(defineProps<Props>(), {
  type: 'fade',
});

// Map prop type to CONSTANTS.TRANSITIONS key
const transitionMap = {
  fade: CONSTANTS.TRANSITIONS.FADE,
  scale: CONSTANTS.TRANSITIONS.SCALE,
  slideUp: CONSTANTS.TRANSITIONS.SLIDE_UP,
  slideDown: CONSTANTS.TRANSITIONS.SLIDE_DOWN,
  collapse: CONSTANTS.TRANSITIONS.COLLAPSE,
} as const;

// Get the appropriate transition config
const transition = transitionMap[props.type];
</script>

<template>
  <Transition
    :enter-active-class="transition.enter"
    :enter-from-class="transition.enterFrom"
    :enter-to-class="transition.enterTo"
    :leave-active-class="transition.leave"
    :leave-from-class="transition.leaveFrom"
    :leave-to-class="transition.leaveTo"
  >
    <slot />
  </Transition>
</template>

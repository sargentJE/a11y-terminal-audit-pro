/**
 * utils/SeverityMapper.js
 * -----------------------------------------------------------------------------
 * Unified severity scoring and WCAG criteria mapping.
 *
 * This module normalizes accessibility issues from different tools
 * (Lighthouse, axe-core, Pa11y) into a unified format with:
 * - Consistent severity levels (1-4: critical, serious, moderate, minor)
 * - WCAG success criteria mapping
 * - Issue deduplication support
 */

/**
 * @typedef {Object} WCAGCriterion
 * @property {string} id - WCAG criterion ID (e.g., '1.1.1')
 * @property {string} name - Human-readable name
 * @property {string} level - Conformance level: 'A' | 'AA' | 'AAA'
 * @property {string} principle - WCAG principle
 * @property {string} guideline - WCAG guideline
 */

/**
 * @typedef {Object} UnifiedIssue
 * @property {string} id - Unique issue identifier
 * @property {string} tool - Source tool: 'lighthouse' | 'axe' | 'pa11y'
 * @property {number} severity - Unified severity: 1 (critical) to 4 (minor)
 * @property {string} severityLabel - Human-readable severity
 * @property {string} message - Issue description
 * @property {string} [selector] - CSS selector for affected element
 * @property {string} [html] - HTML snippet of affected element
 * @property {string} [url] - Page URL where issue was found
 * @property {WCAGCriterion[]} wcagCriteria - Related WCAG criteria
 * @property {string} [help] - Help text / remediation guidance
 * @property {string} [helpUrl] - Link to more information
 */

/** Severity level constants */
export const SEVERITY = {
  CRITICAL: 1,
  SERIOUS: 2,
  MODERATE: 3,
  MINOR: 4,
};

/** Severity labels */
const SEVERITY_LABELS = {
  1: 'critical',
  2: 'serious',
  3: 'moderate',
  4: 'minor',
};

/**
 * WCAG 2.2 Success Criteria Database
 * Maps criterion IDs to their metadata
 */
const WCAG_CRITERIA = {
  // Principle 1: Perceivable
  '1.1.1': { name: 'Non-text Content', level: 'A', principle: 'Perceivable', guideline: 'Text Alternatives' },
  '1.2.1': { name: 'Audio-only and Video-only (Prerecorded)', level: 'A', principle: 'Perceivable', guideline: 'Time-based Media' },
  '1.2.2': { name: 'Captions (Prerecorded)', level: 'A', principle: 'Perceivable', guideline: 'Time-based Media' },
  '1.2.3': { name: 'Audio Description or Media Alternative (Prerecorded)', level: 'A', principle: 'Perceivable', guideline: 'Time-based Media' },
  '1.2.4': { name: 'Captions (Live)', level: 'AA', principle: 'Perceivable', guideline: 'Time-based Media' },
  '1.2.5': { name: 'Audio Description (Prerecorded)', level: 'AA', principle: 'Perceivable', guideline: 'Time-based Media' },
  '1.2.6': { name: 'Sign Language (Prerecorded)', level: 'AAA', principle: 'Perceivable', guideline: 'Time-based Media' },
  '1.2.7': { name: 'Extended Audio Description (Prerecorded)', level: 'AAA', principle: 'Perceivable', guideline: 'Time-based Media' },
  '1.2.8': { name: 'Media Alternative (Prerecorded)', level: 'AAA', principle: 'Perceivable', guideline: 'Time-based Media' },
  '1.2.9': { name: 'Audio-only (Live)', level: 'AAA', principle: 'Perceivable', guideline: 'Time-based Media' },
  '1.3.1': { name: 'Info and Relationships', level: 'A', principle: 'Perceivable', guideline: 'Adaptable' },
  '1.3.2': { name: 'Meaningful Sequence', level: 'A', principle: 'Perceivable', guideline: 'Adaptable' },
  '1.3.3': { name: 'Sensory Characteristics', level: 'A', principle: 'Perceivable', guideline: 'Adaptable' },
  '1.3.4': { name: 'Orientation', level: 'AA', principle: 'Perceivable', guideline: 'Adaptable' },
  '1.3.5': { name: 'Identify Input Purpose', level: 'AA', principle: 'Perceivable', guideline: 'Adaptable' },
  '1.3.6': { name: 'Identify Purpose', level: 'AAA', principle: 'Perceivable', guideline: 'Adaptable' },
  '1.4.1': { name: 'Use of Color', level: 'A', principle: 'Perceivable', guideline: 'Distinguishable' },
  '1.4.2': { name: 'Audio Control', level: 'A', principle: 'Perceivable', guideline: 'Distinguishable' },
  '1.4.3': { name: 'Contrast (Minimum)', level: 'AA', principle: 'Perceivable', guideline: 'Distinguishable' },
  '1.4.4': { name: 'Resize Text', level: 'AA', principle: 'Perceivable', guideline: 'Distinguishable' },
  '1.4.5': { name: 'Images of Text', level: 'AA', principle: 'Perceivable', guideline: 'Distinguishable' },
  '1.4.6': { name: 'Contrast (Enhanced)', level: 'AAA', principle: 'Perceivable', guideline: 'Distinguishable' },
  '1.4.7': { name: 'Low or No Background Audio', level: 'AAA', principle: 'Perceivable', guideline: 'Distinguishable' },
  '1.4.8': { name: 'Visual Presentation', level: 'AAA', principle: 'Perceivable', guideline: 'Distinguishable' },
  '1.4.9': { name: 'Images of Text (No Exception)', level: 'AAA', principle: 'Perceivable', guideline: 'Distinguishable' },
  '1.4.10': { name: 'Reflow', level: 'AA', principle: 'Perceivable', guideline: 'Distinguishable' },
  '1.4.11': { name: 'Non-text Contrast', level: 'AA', principle: 'Perceivable', guideline: 'Distinguishable' },
  '1.4.12': { name: 'Text Spacing', level: 'AA', principle: 'Perceivable', guideline: 'Distinguishable' },
  '1.4.13': { name: 'Content on Hover or Focus', level: 'AA', principle: 'Perceivable', guideline: 'Distinguishable' },

  // Principle 2: Operable
  '2.1.1': { name: 'Keyboard', level: 'A', principle: 'Operable', guideline: 'Keyboard Accessible' },
  '2.1.2': { name: 'No Keyboard Trap', level: 'A', principle: 'Operable', guideline: 'Keyboard Accessible' },
  '2.1.3': { name: 'Keyboard (No Exception)', level: 'AAA', principle: 'Operable', guideline: 'Keyboard Accessible' },
  '2.1.4': { name: 'Character Key Shortcuts', level: 'A', principle: 'Operable', guideline: 'Keyboard Accessible' },
  '2.2.1': { name: 'Timing Adjustable', level: 'A', principle: 'Operable', guideline: 'Enough Time' },
  '2.2.2': { name: 'Pause, Stop, Hide', level: 'A', principle: 'Operable', guideline: 'Enough Time' },
  '2.2.3': { name: 'No Timing', level: 'AAA', principle: 'Operable', guideline: 'Enough Time' },
  '2.2.4': { name: 'Interruptions', level: 'AAA', principle: 'Operable', guideline: 'Enough Time' },
  '2.2.5': { name: 'Re-authenticating', level: 'AAA', principle: 'Operable', guideline: 'Enough Time' },
  '2.2.6': { name: 'Timeouts', level: 'AAA', principle: 'Operable', guideline: 'Enough Time' },
  '2.3.1': { name: 'Three Flashes or Below Threshold', level: 'A', principle: 'Operable', guideline: 'Seizures and Physical Reactions' },
  '2.3.2': { name: 'Three Flashes', level: 'AAA', principle: 'Operable', guideline: 'Seizures and Physical Reactions' },
  '2.3.3': { name: 'Animation from Interactions', level: 'AAA', principle: 'Operable', guideline: 'Seizures and Physical Reactions' },
  '2.4.1': { name: 'Bypass Blocks', level: 'A', principle: 'Operable', guideline: 'Navigable' },
  '2.4.2': { name: 'Page Titled', level: 'A', principle: 'Operable', guideline: 'Navigable' },
  '2.4.3': { name: 'Focus Order', level: 'A', principle: 'Operable', guideline: 'Navigable' },
  '2.4.4': { name: 'Link Purpose (In Context)', level: 'A', principle: 'Operable', guideline: 'Navigable' },
  '2.4.5': { name: 'Multiple Ways', level: 'AA', principle: 'Operable', guideline: 'Navigable' },
  '2.4.6': { name: 'Headings and Labels', level: 'AA', principle: 'Operable', guideline: 'Navigable' },
  '2.4.7': { name: 'Focus Visible', level: 'AA', principle: 'Operable', guideline: 'Navigable' },
  '2.4.8': { name: 'Location', level: 'AAA', principle: 'Operable', guideline: 'Navigable' },
  '2.4.9': { name: 'Link Purpose (Link Only)', level: 'AAA', principle: 'Operable', guideline: 'Navigable' },
  '2.4.10': { name: 'Section Headings', level: 'AAA', principle: 'Operable', guideline: 'Navigable' },
  '2.4.11': { name: 'Focus Not Obscured (Minimum)', level: 'AA', principle: 'Operable', guideline: 'Navigable' },
  '2.4.12': { name: 'Focus Not Obscured (Enhanced)', level: 'AAA', principle: 'Operable', guideline: 'Navigable' },
  '2.4.13': { name: 'Focus Appearance', level: 'AAA', principle: 'Operable', guideline: 'Navigable' },
  '2.5.1': { name: 'Pointer Gestures', level: 'A', principle: 'Operable', guideline: 'Input Modalities' },
  '2.5.2': { name: 'Pointer Cancellation', level: 'A', principle: 'Operable', guideline: 'Input Modalities' },
  '2.5.3': { name: 'Label in Name', level: 'A', principle: 'Operable', guideline: 'Input Modalities' },
  '2.5.4': { name: 'Motion Actuation', level: 'A', principle: 'Operable', guideline: 'Input Modalities' },
  '2.5.5': { name: 'Target Size (Enhanced)', level: 'AAA', principle: 'Operable', guideline: 'Input Modalities' },
  '2.5.6': { name: 'Concurrent Input Mechanisms', level: 'AAA', principle: 'Operable', guideline: 'Input Modalities' },
  '2.5.7': { name: 'Dragging Movements', level: 'AA', principle: 'Operable', guideline: 'Input Modalities' },
  '2.5.8': { name: 'Target Size (Minimum)', level: 'AA', principle: 'Operable', guideline: 'Input Modalities' },

  // Principle 3: Understandable
  '3.1.1': { name: 'Language of Page', level: 'A', principle: 'Understandable', guideline: 'Readable' },
  '3.1.2': { name: 'Language of Parts', level: 'AA', principle: 'Understandable', guideline: 'Readable' },
  '3.1.3': { name: 'Unusual Words', level: 'AAA', principle: 'Understandable', guideline: 'Readable' },
  '3.1.4': { name: 'Abbreviations', level: 'AAA', principle: 'Understandable', guideline: 'Readable' },
  '3.1.5': { name: 'Reading Level', level: 'AAA', principle: 'Understandable', guideline: 'Readable' },
  '3.1.6': { name: 'Pronunciation', level: 'AAA', principle: 'Understandable', guideline: 'Readable' },
  '3.2.1': { name: 'On Focus', level: 'A', principle: 'Understandable', guideline: 'Predictable' },
  '3.2.2': { name: 'On Input', level: 'A', principle: 'Understandable', guideline: 'Predictable' },
  '3.2.3': { name: 'Consistent Navigation', level: 'AA', principle: 'Understandable', guideline: 'Predictable' },
  '3.2.4': { name: 'Consistent Identification', level: 'AA', principle: 'Understandable', guideline: 'Predictable' },
  '3.2.5': { name: 'Change on Request', level: 'AAA', principle: 'Understandable', guideline: 'Predictable' },
  '3.2.6': { name: 'Consistent Help', level: 'A', principle: 'Understandable', guideline: 'Predictable' },
  '3.3.1': { name: 'Error Identification', level: 'A', principle: 'Understandable', guideline: 'Input Assistance' },
  '3.3.2': { name: 'Labels or Instructions', level: 'A', principle: 'Understandable', guideline: 'Input Assistance' },
  '3.3.3': { name: 'Error Suggestion', level: 'AA', principle: 'Understandable', guideline: 'Input Assistance' },
  '3.3.4': { name: 'Error Prevention (Legal, Financial, Data)', level: 'AA', principle: 'Understandable', guideline: 'Input Assistance' },
  '3.3.5': { name: 'Help', level: 'AAA', principle: 'Understandable', guideline: 'Input Assistance' },
  '3.3.6': { name: 'Error Prevention (All)', level: 'AAA', principle: 'Understandable', guideline: 'Input Assistance' },
  '3.3.7': { name: 'Redundant Entry', level: 'A', principle: 'Understandable', guideline: 'Input Assistance' },
  '3.3.8': { name: 'Accessible Authentication (Minimum)', level: 'AA', principle: 'Understandable', guideline: 'Input Assistance' },
  '3.3.9': { name: 'Accessible Authentication (Enhanced)', level: 'AAA', principle: 'Understandable', guideline: 'Input Assistance' },

  // Principle 4: Robust
  '4.1.1': { name: 'Parsing', level: 'A', principle: 'Robust', guideline: 'Compatible' },
  '4.1.2': { name: 'Name, Role, Value', level: 'A', principle: 'Robust', guideline: 'Compatible' },
  '4.1.3': { name: 'Status Messages', level: 'AA', principle: 'Robust', guideline: 'Compatible' },
};

/**
 * Mapping from axe-core rule IDs to WCAG criteria
 * Based on axe-core rule metadata
 */
const AXE_TO_WCAG = {
  'area-alt': ['1.1.1', '4.1.2'],
  'aria-allowed-attr': ['4.1.2'],
  'aria-allowed-role': ['4.1.2'],
  'aria-command-name': ['4.1.2'],
  'aria-dialog-name': ['4.1.2'],
  'aria-hidden-body': ['4.1.2'],
  'aria-hidden-focus': ['4.1.2'],
  'aria-input-field-name': ['4.1.2'],
  'aria-meter-name': ['1.1.1'],
  'aria-progressbar-name': ['1.1.1'],
  'aria-required-attr': ['4.1.2'],
  'aria-required-children': ['1.3.1'],
  'aria-required-parent': ['1.3.1'],
  'aria-roledescription': ['4.1.2'],
  'aria-roles': ['4.1.2'],
  'aria-text': ['4.1.2'],
  'aria-toggle-field-name': ['4.1.2'],
  'aria-tooltip-name': ['4.1.2'],
  'aria-treeitem-name': ['4.1.2'],
  'aria-valid-attr-value': ['4.1.2'],
  'aria-valid-attr': ['4.1.2'],
  'blink': ['2.2.2'],
  'button-name': ['4.1.2'],
  'bypass': ['2.4.1'],
  'color-contrast': ['1.4.3'],
  'color-contrast-enhanced': ['1.4.6'],
  'definition-list': ['1.3.1'],
  'dlitem': ['1.3.1'],
  'document-title': ['2.4.2'],
  'duplicate-id-active': ['4.1.1'],
  'duplicate-id-aria': ['4.1.1'],
  'duplicate-id': ['4.1.1'],
  'empty-heading': ['1.3.1', '2.4.6'],
  'empty-table-header': ['1.3.1'],
  'focus-order-semantics': ['2.4.3'],
  'form-field-multiple-labels': ['1.3.1'],
  'frame-focusable-content': ['2.1.1'],
  'frame-title-unique': ['4.1.2'],
  'frame-title': ['4.1.2'],
  'heading-order': ['1.3.1'],
  'html-has-lang': ['3.1.1'],
  'html-lang-valid': ['3.1.1'],
  'html-xml-lang-mismatch': ['3.1.1'],
  'image-alt': ['1.1.1'],
  'image-redundant-alt': ['1.1.1'],
  'input-button-name': ['4.1.2'],
  'input-image-alt': ['1.1.1'],
  'label-content-name-mismatch': ['2.5.3'],
  'label-title-only': ['3.3.2'],
  'label': ['1.3.1', '3.3.2'],
  'landmark-banner-is-top-level': ['1.3.1'],
  'landmark-complementary-is-top-level': ['1.3.1'],
  'landmark-contentinfo-is-top-level': ['1.3.1'],
  'landmark-main-is-top-level': ['1.3.1'],
  'landmark-no-duplicate-banner': ['1.3.1'],
  'landmark-no-duplicate-contentinfo': ['1.3.1'],
  'landmark-no-duplicate-main': ['1.3.1'],
  'landmark-one-main': ['1.3.1'],
  'landmark-unique': ['1.3.1'],
  'link-in-text-block': ['1.4.1'],
  'link-name': ['2.4.4', '4.1.2'],
  'list': ['1.3.1'],
  'listitem': ['1.3.1'],
  'marquee': ['2.2.2'],
  'meta-refresh': ['2.2.1', '2.2.4', '3.2.5'],
  'meta-viewport': ['1.4.4'],
  'nested-interactive': ['4.1.2'],
  'no-autoplay-audio': ['1.4.2'],
  'object-alt': ['1.1.1'],
  'p-as-heading': ['1.3.1'],
  'page-has-heading-one': ['1.3.1'],
  'region': ['1.3.1'],
  'role-img-alt': ['1.1.1'],
  'scope-attr-valid': ['1.3.1'],
  'scrollable-region-focusable': ['2.1.1'],
  'select-name': ['4.1.2'],
  'server-side-image-map': ['2.1.1'],
  'skip-link': ['2.4.1'],
  'svg-img-alt': ['1.1.1'],
  'tabindex': ['2.4.3'],
  'table-duplicate-name': ['1.3.1'],
  'table-fake-caption': ['1.3.1'],
  'target-size': ['2.5.8'],
  'td-has-header': ['1.3.1'],
  'td-headers-attr': ['1.3.1'],
  'th-has-data-cells': ['1.3.1'],
  'valid-lang': ['3.1.2'],
  'video-caption': ['1.2.2'],
};

/**
 * Mapping from Pa11y/HTMLCS rule codes to WCAG criteria
 */
const PA11Y_TO_WCAG = {
  'WCAG2A.Principle1.Guideline1_1.1_1_1': ['1.1.1'],
  'WCAG2A.Principle1.Guideline1_2.1_2_1': ['1.2.1'],
  'WCAG2A.Principle1.Guideline1_2.1_2_2': ['1.2.2'],
  'WCAG2A.Principle1.Guideline1_2.1_2_3': ['1.2.3'],
  'WCAG2A.Principle1.Guideline1_3.1_3_1': ['1.3.1'],
  'WCAG2A.Principle1.Guideline1_3.1_3_2': ['1.3.2'],
  'WCAG2A.Principle1.Guideline1_3.1_3_3': ['1.3.3'],
  'WCAG2A.Principle1.Guideline1_4.1_4_1': ['1.4.1'],
  'WCAG2A.Principle1.Guideline1_4.1_4_2': ['1.4.2'],
  'WCAG2A.Principle2.Guideline2_1.2_1_1': ['2.1.1'],
  'WCAG2A.Principle2.Guideline2_1.2_1_2': ['2.1.2'],
  'WCAG2A.Principle2.Guideline2_1.2_1_4': ['2.1.4'],
  'WCAG2A.Principle2.Guideline2_2.2_2_1': ['2.2.1'],
  'WCAG2A.Principle2.Guideline2_2.2_2_2': ['2.2.2'],
  'WCAG2A.Principle2.Guideline2_3.2_3_1': ['2.3.1'],
  'WCAG2A.Principle2.Guideline2_4.2_4_1': ['2.4.1'],
  'WCAG2A.Principle2.Guideline2_4.2_4_2': ['2.4.2'],
  'WCAG2A.Principle2.Guideline2_4.2_4_3': ['2.4.3'],
  'WCAG2A.Principle2.Guideline2_4.2_4_4': ['2.4.4'],
  'WCAG2A.Principle2.Guideline2_5.2_5_1': ['2.5.1'],
  'WCAG2A.Principle2.Guideline2_5.2_5_2': ['2.5.2'],
  'WCAG2A.Principle2.Guideline2_5.2_5_3': ['2.5.3'],
  'WCAG2A.Principle2.Guideline2_5.2_5_4': ['2.5.4'],
  'WCAG2A.Principle3.Guideline3_1.3_1_1': ['3.1.1'],
  'WCAG2A.Principle3.Guideline3_2.3_2_1': ['3.2.1'],
  'WCAG2A.Principle3.Guideline3_2.3_2_2': ['3.2.2'],
  'WCAG2A.Principle3.Guideline3_2.3_2_6': ['3.2.6'],
  'WCAG2A.Principle3.Guideline3_3.3_3_1': ['3.3.1'],
  'WCAG2A.Principle3.Guideline3_3.3_3_2': ['3.3.2'],
  'WCAG2A.Principle3.Guideline3_3.3_3_7': ['3.3.7'],
  'WCAG2A.Principle4.Guideline4_1.4_1_1': ['4.1.1'],
  'WCAG2A.Principle4.Guideline4_1.4_1_2': ['4.1.2'],
  'WCAG2AA.Principle1.Guideline1_2.1_2_4': ['1.2.4'],
  'WCAG2AA.Principle1.Guideline1_2.1_2_5': ['1.2.5'],
  'WCAG2AA.Principle1.Guideline1_3.1_3_4': ['1.3.4'],
  'WCAG2AA.Principle1.Guideline1_3.1_3_5': ['1.3.5'],
  'WCAG2AA.Principle1.Guideline1_4.1_4_3': ['1.4.3'],
  'WCAG2AA.Principle1.Guideline1_4.1_4_4': ['1.4.4'],
  'WCAG2AA.Principle1.Guideline1_4.1_4_5': ['1.4.5'],
  'WCAG2AA.Principle1.Guideline1_4.1_4_10': ['1.4.10'],
  'WCAG2AA.Principle1.Guideline1_4.1_4_11': ['1.4.11'],
  'WCAG2AA.Principle1.Guideline1_4.1_4_12': ['1.4.12'],
  'WCAG2AA.Principle1.Guideline1_4.1_4_13': ['1.4.13'],
  'WCAG2AA.Principle2.Guideline2_4.2_4_5': ['2.4.5'],
  'WCAG2AA.Principle2.Guideline2_4.2_4_6': ['2.4.6'],
  'WCAG2AA.Principle2.Guideline2_4.2_4_7': ['2.4.7'],
  'WCAG2AA.Principle2.Guideline2_4.2_4_11': ['2.4.11'],
  'WCAG2AA.Principle2.Guideline2_5.2_5_7': ['2.5.7'],
  'WCAG2AA.Principle2.Guideline2_5.2_5_8': ['2.5.8'],
  'WCAG2AA.Principle3.Guideline3_1.3_1_2': ['3.1.2'],
  'WCAG2AA.Principle3.Guideline3_2.3_2_3': ['3.2.3'],
  'WCAG2AA.Principle3.Guideline3_2.3_2_4': ['3.2.4'],
  'WCAG2AA.Principle3.Guideline3_3.3_3_3': ['3.3.3'],
  'WCAG2AA.Principle3.Guideline3_3.3_3_4': ['3.3.4'],
  'WCAG2AA.Principle3.Guideline3_3.3_3_8': ['3.3.8'],
  'WCAG2AA.Principle4.Guideline4_1.4_1_3': ['4.1.3'],
};

/**
 * Mapping from Lighthouse audit IDs to WCAG criteria
 */
const LIGHTHOUSE_TO_WCAG = {
  'accesskeys': ['4.1.1'],
  'aria-allowed-attr': ['4.1.2'],
  'aria-command-name': ['4.1.2'],
  'aria-hidden-body': ['4.1.2'],
  'aria-hidden-focus': ['4.1.2'],
  'aria-input-field-name': ['4.1.2'],
  'aria-meter-name': ['1.1.1'],
  'aria-progressbar-name': ['1.1.1'],
  'aria-required-attr': ['4.1.2'],
  'aria-required-children': ['1.3.1'],
  'aria-required-parent': ['1.3.1'],
  'aria-roles': ['4.1.2'],
  'aria-toggle-field-name': ['4.1.2'],
  'aria-tooltip-name': ['4.1.2'],
  'aria-valid-attr-value': ['4.1.2'],
  'aria-valid-attr': ['4.1.2'],
  'button-name': ['4.1.2'],
  'bypass': ['2.4.1'],
  'color-contrast': ['1.4.3'],
  'definition-list': ['1.3.1'],
  'dlitem': ['1.3.1'],
  'document-title': ['2.4.2'],
  'duplicate-id-active': ['4.1.1'],
  'duplicate-id-aria': ['4.1.1'],
  'form-field-multiple-labels': ['3.3.2'],
  'frame-title': ['4.1.2'],
  'heading-order': ['1.3.1'],
  'html-has-lang': ['3.1.1'],
  'html-lang-valid': ['3.1.1'],
  'image-alt': ['1.1.1'],
  'input-image-alt': ['1.1.1'],
  'label': ['1.3.1', '3.3.2'],
  'link-name': ['2.4.4', '4.1.2'],
  'list': ['1.3.1'],
  'listitem': ['1.3.1'],
  'meta-refresh': ['2.2.1'],
  'meta-viewport': ['1.4.4'],
  'object-alt': ['1.1.1'],
  'tabindex': ['2.4.3'],
  'td-headers-attr': ['1.3.1'],
  'th-has-data-cells': ['1.3.1'],
  'valid-lang': ['3.1.2'],
  'video-caption': ['1.2.2'],
};

export class SeverityMapper {
  /**
   * Convert axe-core severity to unified severity level.
   *
   * @param {string} impact - axe impact: 'critical' | 'serious' | 'moderate' | 'minor'
   * @returns {number}
   */
  static axeSeverity(impact) {
    const mapping = {
      critical: SEVERITY.CRITICAL,
      serious: SEVERITY.SERIOUS,
      moderate: SEVERITY.MODERATE,
      minor: SEVERITY.MINOR,
    };
    return mapping[impact] ?? SEVERITY.MODERATE;
  }

  /**
   * Convert Pa11y type to unified severity level.
   *
   * @param {string} type - Pa11y type: 'error' | 'warning' | 'notice'
   * @returns {number}
   */
  static pa11ySeverity(type) {
    const mapping = {
      error: SEVERITY.SERIOUS,
      warning: SEVERITY.MODERATE,
      notice: SEVERITY.MINOR,
    };
    return mapping[type] ?? SEVERITY.MODERATE;
  }

  /**
   * Convert Lighthouse score impact to unified severity.
   * Lighthouse doesn't have per-issue severity, so we derive from the audit's weight.
   *
   * @param {number} weight - Lighthouse audit weight (0-1)
   * @returns {number}
   */
  static lighthouseSeverity(weight) {
    if (weight >= 0.7) return SEVERITY.CRITICAL;
    if (weight >= 0.4) return SEVERITY.SERIOUS;
    if (weight >= 0.1) return SEVERITY.MODERATE;
    return SEVERITY.MINOR;
  }

  /**
   * Get WCAG criteria for an axe-core rule.
   *
   * @param {string} ruleId - axe-core rule ID
   * @returns {WCAGCriterion[]}
   */
  static getWcagForAxeRule(ruleId) {
    const criteriaIds = AXE_TO_WCAG[ruleId] ?? [];
    return criteriaIds.map((id) => ({
      id,
      ...WCAG_CRITERIA[id],
    })).filter((c) => c.name);
  }

  /**
   * Get WCAG criteria for a Pa11y rule.
   *
   * @param {string} code - Pa11y rule code
   * @returns {WCAGCriterion[]}
   */
  static getWcagForPa11yRule(code) {
    // Try exact match first
    let criteriaIds = PA11Y_TO_WCAG[code];

    // Extract WCAG criterion from code pattern (e.g., "WCAG2AA.Principle1.Guideline1_4.1_4_3.G18")
    if (!criteriaIds) {
      const match = code.match(/Guideline(\d+)_(\d+)\.(\d+)_(\d+)_(\d+)/);
      if (match) {
        const criterionId = `${match[3]}.${match[4]}.${match[5]}`;
        if (WCAG_CRITERIA[criterionId]) {
          criteriaIds = [criterionId];
        }
      }
    }

    if (!criteriaIds) return [];

    return criteriaIds.map((id) => ({
      id,
      ...WCAG_CRITERIA[id],
    })).filter((c) => c.name);
  }

  /**
   * Get WCAG criteria for a Lighthouse audit.
   *
   * @param {string} auditId - Lighthouse audit ID
   * @returns {WCAGCriterion[]}
   */
  static getWcagForLighthouseAudit(auditId) {
    const criteriaIds = LIGHTHOUSE_TO_WCAG[auditId] ?? [];
    return criteriaIds.map((id) => ({
      id,
      ...WCAG_CRITERIA[id],
    })).filter((c) => c.name);
  }

  /**
   * Normalize an axe-core violation to unified format.
   *
   * @param {Object} violation - axe violation object
   * @param {string} url - Page URL
   * @returns {UnifiedIssue[]}
   */
  static normalizeAxeViolation(violation, url) {
    const severity = SeverityMapper.axeSeverity(violation.impact);
    const wcagCriteria = SeverityMapper.getWcagForAxeRule(violation.id);

    return (violation.nodes || []).map((node, idx) => ({
      id: `axe-${violation.id}-${idx}`,
      tool: 'axe',
      severity,
      severityLabel: SEVERITY_LABELS[severity],
      message: violation.description || violation.help,
      selector: node.target?.join(' ') || node.html,
      html: node.html,
      url,
      wcagCriteria,
      help: violation.help,
      helpUrl: violation.helpUrl,
    }));
  }

  /**
   * Normalize a Pa11y issue to unified format.
   *
   * @param {Object} issue - Pa11y issue object
   * @param {string} url - Page URL
   * @returns {UnifiedIssue}
   */
  static normalizePa11yIssue(issue, url) {
    const severity = SeverityMapper.pa11ySeverity(issue.type);
    const wcagCriteria = SeverityMapper.getWcagForPa11yRule(issue.code);

    return {
      id: `pa11y-${issue.code}-${issue.selector || 'unknown'}`,
      tool: 'pa11y',
      severity,
      severityLabel: SEVERITY_LABELS[severity],
      message: issue.message,
      selector: issue.selector,
      html: issue.context,
      url,
      wcagCriteria,
      help: issue.message,
      helpUrl: null,
    };
  }

  /**
   * Normalize a Lighthouse audit failure to unified format.
   *
   * @param {Object} audit - Lighthouse audit object
   * @param {string} url - Page URL
   * @returns {UnifiedIssue[]}
   */
  static normalizeLighthouseAudit(audit, url) {
    const weight = audit.weight ?? 0.5;
    const severity = SeverityMapper.lighthouseSeverity(weight);
    const wcagCriteria = SeverityMapper.getWcagForLighthouseAudit(audit.id);

    // Lighthouse audits may have multiple items (affected elements)
    const items = audit.details?.items || [{}];

    return items.map((item, idx) => ({
      id: `lighthouse-${audit.id}-${idx}`,
      tool: 'lighthouse',
      severity,
      severityLabel: SEVERITY_LABELS[severity],
      message: audit.title || audit.description,
      selector: item.node?.selector || item.selector,
      html: item.node?.snippet || item.snippet,
      url,
      wcagCriteria,
      help: audit.description,
      helpUrl: null,
    }));
  }

  /**
   * Get severity label from numeric value.
   *
   * @param {number} severity
   * @returns {string}
   */
  static getSeverityLabel(severity) {
    return SEVERITY_LABELS[severity] || 'unknown';
  }

  /**
   * Get all WCAG criteria.
   *
   * @returns {Object<string, WCAGCriterion>}
   */
  static getAllWcagCriteria() {
    return WCAG_CRITERIA;
  }
}

export default SeverityMapper;

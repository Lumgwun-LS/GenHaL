/**
 * VendorHub brand palette.
 *
 * Primary:  #7F50FF  — electric violet
 * Accent:   #FF7F50  — coral
 *
 * Both colours are used for text, gradients, icons and interactive states.
 */

const colors = {
  light: {
    // Legacy aliases
    text: '#1A0B3B',
    tint: '#7F50FF',

    // Core surfaces
    background: '#F8F5FF',
    foreground: '#1A0B3B',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#1A0B3B',

    // Primary action — electric violet
    primary: '#7F50FF',
    primaryForeground: '#FFFFFF',

    // Accent — coral
    accent: '#FF7F50',
    accentForeground: '#FFFFFF',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#F3EEFF',
    secondaryForeground: '#4A2FA0',

    // Muted / subdued elements
    muted: '#F0EBFF',
    mutedForeground: '#7B6BA8',

    // Destructive actions
    destructive: '#FF4444',
    destructiveForeground: '#FFFFFF',

    // Success / positive states
    success: '#00C896',
    successForeground: '#F0FFF9',

    // Warning states
    warning: '#FF9500',
    warningForeground: '#FFF8F0',

    // Borders and input outlines
    border: '#E8E0FF',
    input: '#E8E0FF',

    // Gradient pair (used by GradientButton, hero sections)
    gradientStart: '#7F50FF',
    gradientEnd: '#FF7F50',
  },

  dark: {
    text: '#F0EBFF',
    tint: '#9B74FF',

    background: '#0D0A1F',
    foreground: '#F0EBFF',

    card: '#1A1535',
    cardForeground: '#F0EBFF',

    primary: '#9B74FF',
    primaryForeground: '#0D0A1F',

    accent: '#FF7F50',
    accentForeground: '#0D0A1F',

    secondary: '#241D4A',
    secondaryForeground: '#C4B4FF',

    muted: '#1E1840',
    mutedForeground: '#8A7BC0',

    destructive: '#FF6B6B',
    destructiveForeground: '#1A0505',

    success: '#00E5B0',
    successForeground: '#002E22',

    warning: '#FFB000',
    warningForeground: '#2E2000',

    border: '#2E2660',
    input: '#2E2660',

    gradientStart: '#7F50FF',
    gradientEnd: '#FF7F50',
  },

  // Border radius in px
  radius: 12,
};

export default colors;

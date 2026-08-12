/**
 * Social platforms shown in the settings social sheet and the hub summary, in
 * display order. Kept in its own module (no components) so the sheet file stays
 * component-only for fast refresh.
 */
import { he } from '../../locale/he'

export const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: he.settings.socialInstagram, placeholder: '@studio' },
  { key: 'facebook', label: he.settings.socialFacebook, placeholder: '@studio' },
  { key: 'tiktok', label: he.settings.socialTiktok, placeholder: '@studio' },
  { key: 'youtube', label: he.settings.socialYoutube, placeholder: '@studio' },
  { key: 'website', label: he.settings.socialWebsite, placeholder: 'https://…' },
] as const

export type SocialKey = (typeof SOCIAL_PLATFORMS)[number]['key']

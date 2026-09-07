import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

/**
 * Inline Lucide-style stroke icons lifted from the Qubi design mockups.
 * Rendered with react-native-svg (SvgXml) so the stroke geometry stays
 * pixel-faithful to the flutter_svg originals. Ported from app_icons.dart.
 */

const STROKE: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a2 2 0 0 1-2 2h-5v-6H10v6H5a2 2 0 0 1-2-2Z"/>',
  tasks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  trophy:
    '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>' +
    '<path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>' +
    '<path d="M4 22h16"/>' +
    '<path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>' +
    '<path d="M14 14.66V17c0 .55.47.98.97 1.21 1.18.54 2.03 2.03 2.03 3.79"/>' +
    '<path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/>',
  camera:
    '<rect x="5" y="11" width="14" height="10" rx="2"/>' +
    '<path d="M12 11V7"/>' +
    '<path d="M9 7h6"/>' +
    '<circle cx="12" cy="16" r="3"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  dumbbell: '<path d="M6.5 6.5l11 11M21 21l-1-1M3 3l1 1M18 22l4-4M2 6l4-4M3 10l7-7M14 21l7-7"/>',
  book:
    '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>' +
    '<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  sparkle: '<path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>',
  droplet: '<path d="M12 2.7S6 9 6 14a6 6 0 0 0 12 0c0-5-6-11.3-6-11.3z"/><path d="M8.5 14a3.5 3.5 0 0 0 3.5 3.5"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  chevronRight: '<path d="M9 18l6-6-6-6"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  alert: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  grid:
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/>' +
    '<rect x="14" y="3" width="7" height="7" rx="1.5"/>' +
    '<rect x="3" y="14" width="7" height="7" rx="1.5"/>' +
    '<rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  flip:
    '<path d="M11 17H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h2l2-3h6l2 3h2a1 1 0 0 1 1 1v3"/>' +
    '<path d="M21 16.5a5.5 5.5 0 0 1-5 3.5 5.5 5.5 0 0 1-5.4-4"/>' +
    '<path d="m8 16.5 2-1.5 2 1.5M8 19.5V15"/>',
  archive: '<path d="M4 8h16M4 4h16v4H4zM5 8v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
  moonStar: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  star: '<path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.5 7.2 17l.9-5.4L4.2 7.7l5.4-.8z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  leaf:
    '<path d="M12 20.5c-2.6 0-4.9-1.4-6.2-3.7 2.2.2 4.5 1 5.8 2.3 1.3-1.3 3.6-2.1 5.8-2.3-1.3 2.3-3.6 3.7-5.4 3.7Z"/>' +
    '<path d="M12 13.6c-1.7-1.4-3.1-3.6-3.7-6.4 1.7.4 3.2 1.3 3.7 2.6.5-1.3 2-2.2 3.7-2.6-.6 2.8-2 5-3.7 6.4Z"/>',
  homeOutlined:
    '<path d="M3.5 10.5 12 3.8l8.5 6.7"/>' +
    '<path d="M5.5 9.2V20h13V9.2"/>' +
    '<path d="M10 20v-5.2h4V20"/>' +
    '<path d="M16.8 3.6l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7.7-1.6Z"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  rocket:
    '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>' +
    '<path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>' +
    '<path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>' +
    '<path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  snowflake: '<path d="M2 12h20M12 2v20M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>' +
    '<circle cx="12" cy="12" r="3"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  checkCircle: '<path d="M22 11.1V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  accountTree:
    '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/>' +
    '<path d="M6 9v6M18 9v1a5 5 0 0 1-5 5H9"/>',
  medal:
    '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/>' +
    '<path d="M11 12 5.12 2.2M13 12l5.88-9.8M8 7h8"/>' +
    '<path d="m21 15-5 5M21 20l-5-5"/>',
  flash: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  replay: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  verified:
    '<path d="M12 22a9.5 9.5 0 0 1-2.2-.27 1 1 0 0 1-.62-.43l-.8-1.14a1 1 0 0 0-1.13-.36l-1.37.5a1 1 0 0 1-1.23-1.3l.48-1.38a1 1 0 0 0-.37-1.13l-1.13-.8a1 1 0 0 1-.43-.62A9.5 9.5 0 0 1 2 12a9.5 9.5 0 0 1 .27-2.2 1 1 0 0 1 .43-.62l1.14-.8a1 1 0 0 0 .36-1.13l-.5-1.37a1 1 0 0 1 1.3-1.23l1.38.48a1 1 0 0 0 1.13-.37l.8-1.13a1 1 0 0 1 .62-.43A9.5 9.5 0 0 1 12 2a9.5 9.5 0 0 1 2.2.27 1 1 0 0 1 .62.43l.8 1.14a1 1 0 0 0 1.13.36l1.37-.5a1 1 0 0 1 1.23 1.3l-.48 1.38a1 1 0 0 0 .37 1.13l1.13.8a1 1 0 0 1 .43.62A9.5 9.5 0 0 1 22 12a9.5 9.5 0 0 1-.27 2.2 1 1 0 0 1-.43.62l-1.14.8a1 1 0 0 0-.36 1.13l.5 1.37a1 1 0 0 1-1.3 1.23l-1.38-.48a1 1 0 0 0-1.13.37l-.8 1.13a1 1 0 0 1-.62.43A9.5 9.5 0 0 1 12 22z"/>' +
    '<path d="m9 12 2 2 4-4"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>' +
    '<circle cx="9" cy="7" r="4"/>' +
    '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/>' +
    '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
};

const FILLED: Record<string, string> = {
  zapFilled: '<path d="M13 2 4.6 13.4h5.7L9.7 22l8.7-11.6h-5.7L13 2Z"/>',
};

function hex(color: string): string {
  const c = color.trim();
  if (c.startsWith('#')) {
    if (c.length === 9) return c.slice(0, 7); // #RRGGBBAA → drop alpha like Dart's _hex
    if (c.length === 4) {
      // #RGB → expand
      return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    }
    return c;
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (rgba != null) {
    const parts = rgba[1].split(',').map((p) => Number.parseFloat(p.trim()));
    const to2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${to2(parts[0])}${to2(parts[1])}${to2(parts[2])}`;
  }
  return '#FFFFFF';
}

export function raw(name: string, color: string, strokeWidth = 2): string {
  const paths = STROKE[name] ?? FILLED[name] ?? '';
  return (
    `<svg viewBox="0 0 24 24" fill="none" stroke="${hex(color)}" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
  );
}

export function StrokeIcon({
  name,
  size = 22,
  color = '#FFFFFF',
  strokeWidth = 2.0,
}: {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <View accessible accessibilityLabel={name} style={{ width: size, height: size }}>
      <SvgXml xml={raw(name, color, strokeWidth)} width={size} height={size} />
    </View>
  );
}

export function FilledIcon({
  name,
  size = 22,
  color = '#FFFFFF',
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  const paths = FILLED[name] ?? '';
  return (
    <View accessible accessibilityLabel={name} style={{ width: size, height: size }}>
      <SvgXml xml={`<svg viewBox="0 0 24 24" fill="${hex(color)}">${paths}</svg>`} width={size} height={size} />
    </View>
  );
}

/** Official multicolour Google "G" lockup for "Continue with Google" CTAs. */
export function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <View accessible accessibilityLabel="Google" style={{ width: size, height: size }}>
      <SvgXml
        xml={
          '<svg viewBox="0 0 48 48" width="48" height="48">' +
          '<path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>' +
          '<path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>' +
          '<path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>' +
          '<path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>' +
          '</svg>'
        }
        width={size}
        height={size}
      />
    </View>
  );
}

/** Apple logo for "Continue with Apple" CTAs. */
export function AppleLogo({ size = 22, color = '#000000' }: { size?: number; color?: string }) {
  return (
    <View accessible accessibilityLabel="Apple" style={{ width: size, height: size }}>
      <SvgXml
        xml={
          `<svg viewBox="0 0 24 24" fill="${hex(color)}">` +
          '<path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>' +
          '</svg>'
        }
        width={size}
        height={size}
      />
    </View>
  );
}

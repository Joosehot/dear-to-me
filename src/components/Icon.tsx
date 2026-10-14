import { Fragment, type ReactNode } from 'react';

// The app's icons are pixel art made by Piksu, one sentence each ("a pen, 32px"), in public/icons/.
// Texts keep an emoji where an icon goes; `rich` turns those into the icons.

const EMOJI: Record<string, string> = {
  '✍️': 'pen',
  '✍': 'pen',
  '🎥': 'camcorder',
  '🎬': 'camcorder',
  '📷': 'camera',
  '💌': 'envelope',
  '🔍': 'magnifier',
  '🏠': 'house',
  '📝': 'note',
  '🔒': 'lock',
  '🌍': 'globe',
  '🗄️': 'archive',
  '🗄': 'archive',
  '🖼️': 'picture',
  '🖼': 'picture',
  '💬': 'bubble',
  '⏳': 'hourglass',
  '∞': 'infinity',
  '🗑': 'trash',
  '⚑': 'flag',
  '＋': 'plus',
  '👥': 'friends',
  '♥': 'heart',
};

export type IconName = (typeof EMOJI)[string];

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <img className={'icon ' + className} src={`/icons/${name}.png`} width={size} height={size} alt="" aria-hidden="true" />;
}

const PATTERN = new RegExp(`(${Object.keys(EMOJI).sort((a, b) => b.length - a.length).join('|')})`, 'u');

/** A text with its emojis drawn as Piksu's icons. */
export function rich(text: string, size = 16): ReactNode {
  const parts = text.split(PATTERN);
  if (parts.length === 1) return text;
  return parts.map((p, i) => (EMOJI[p] ? <Icon key={i} name={EMOJI[p]} size={size} /> : <Fragment key={i}>{p}</Fragment>));
}

/**
 * Fallback for platforms without home-screen widgets (web). Android and iOS use
 * `BuaicWidget.android.tsx` / `BuaicWidget.ios.tsx`; TypeScript checks callers
 * against this signature.
 */
import type { WidgetContent } from '../../lib/widgetSnapshot';

export function publishWidget(_entries: readonly { date: Date; content: WidgetContent }[]): void {}

import { KidSwitcher } from '../kids/KidSwitcher';
import { TabToggle, type TabBarProps } from './TabToggle';

// On large screens and in landscape there is room across the top, so the tabs join
// the kids, coins and lock in one bar instead of a strip at the bottom.
export function TopTabBar(props: TabBarProps) {
  return <KidSwitcher tabs={<TabToggle {...props} />} />;
}

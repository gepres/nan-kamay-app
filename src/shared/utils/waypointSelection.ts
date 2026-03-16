/**
 * Simple shared state to pass the selected waypoint type
 * from the type selector screen back to the waypoint screen.
 * Avoids navigation issues with creating new screen instances.
 */
let _pendingType: string | null = null;

export function setPendingWaypointType(type: string) {
  _pendingType = type;
}

export function consumePendingWaypointType(): string | null {
  const t = _pendingType;
  _pendingType = null;
  return t;
}

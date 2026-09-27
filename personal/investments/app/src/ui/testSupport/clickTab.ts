import { fireEvent, screen } from "@testing-library/react";

/**
 * Radix's TabsTrigger renders its label twice -- once visible, once hidden
 * at bold weight, so the visible width never shifts on select -- which
 * doubles the accessible name. Matching a prefix sidesteps that
 * implementation detail. Activation is on pointerdown, not click, so the
 * mousedown event is what a real pointer press sends.
 */
export function clickTab(name: string): void {
  fireEvent.mouseDown(screen.getByRole("tab", { name: new RegExp(`^${name}\\b`) }), { button: 0 });
}

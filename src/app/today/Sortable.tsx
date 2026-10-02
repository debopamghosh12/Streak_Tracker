import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Mouse (pointer) drags start after 4 px; touch needs a 200 ms press-and-hold so normal scrolling
 * still works; keyboard: focus the handle, Space to lift, arrows to move, Space to drop.
 */
export function useBoardSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** A sortable list item; renders its children with the drag handle to place in the row. */
export function SortableItem({
  id,
  label,
  reduced,
  children,
}: {
  id: string;
  label: string;
  reduced: boolean;
  children: (handle: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: reduced ? null : undefined,
  });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: reduced ? undefined : transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };
  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`Drag to reorder ${label}`}
      className="w-7 h-10 shrink-0 rounded-lg flex items-center justify-center text-gray-600 hover:text-primary cursor-grab active:cursor-grabbing touch-manipulation focus-visible:ring-2 focus-visible:ring-primary/60 outline-none"
    >
      <GripVertical className="w-4 h-4" />
    </button>
  );
  return (
    <li ref={setNodeRef} style={style}>
      {children(handle)}
    </li>
  );
}

/** Coarse page clock (every 30 s) for the summary line and the "Now" slot. Stopwatches tick separately. */
export function useTicker(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

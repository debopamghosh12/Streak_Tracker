import { Link, NavLink } from 'react-router-dom';

export const APP_LINKS = [
  { label: 'Today', to: '/app' },
  { label: 'Syllabus', to: '/app/syllabus' },
  { label: 'Streak', to: '/app/streak' },
  { label: 'Review', to: '/app/review' },
];

const linkCls = 'text-[10px] sm:text-xs md:text-sm transition-colors duration-200 py-2 inline-flex items-center';

/** Black pill that hangs from the top edge. */
export function PillShell({ children }: { children: React.ReactNode }) {
  return (
    <nav className="bg-black rounded-b-2xl md:rounded-b-3xl px-4 py-2 md:px-8">
      <ul className="flex items-center gap-3 sm:gap-6 md:gap-12 lg:gap-14">{children}</ul>
    </nav>
  );
}

export function HoverLink({ to, children, onClick }: { to?: string; children: React.ReactNode; onClick?: () => void }) {
  const style = { color: 'rgba(225, 224, 204, 0.8)' };
  const enter = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.color = '#E1E0CC');
  const leave = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.color = 'rgba(225, 224, 204, 0.8)');
  if (to)
    return (
      <Link to={to} className={linkCls} style={style} onMouseEnter={enter} onMouseLeave={leave}>
        {children}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={linkCls} style={style} onMouseEnter={enter} onMouseLeave={leave}>
      {children}
    </button>
  );
}

/** App variant: active link full cream with a 1px underline. */
export function AppNavLinks() {
  return (
    <>
      {APP_LINKS.map((l) => (
        <li key={l.to}>
          <NavLink
            to={l.to}
            end={l.to === '/app'}
            className={linkCls + ' relative'}
            style={({ isActive }) => ({ color: isActive ? '#E1E0CC' : 'rgba(225, 224, 204, 0.8)' })}
          >
            {({ isActive }) => (
              <>
                {l.label}
                {isActive && <span className="absolute left-0 right-0 bottom-1 h-px bg-[#E1E0CC]" />}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </>
  );
}

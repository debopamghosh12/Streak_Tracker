import { WordsPullUpMultiStyle } from './WordsPullUpMultiStyle';

export function PageTitle({ first, second, aside }: { first: string; second: string; aside?: React.ReactNode }) {
  return (
    <div className="mt-10 md:mt-14 mb-8 md:mb-10 flex flex-wrap items-end justify-between gap-4">
      <WordsPullUpMultiStyle
        as="h1"
        align="left"
        className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[0.95] tracking-[-0.03em] max-w-4xl"
        style={{ color: '#E1E0CC' }}
        segments={[
          { text: first, className: 'font-normal' },
          { text: second, className: 'italic font-serif' },
        ]}
      />
      {aside}
    </div>
  );
}

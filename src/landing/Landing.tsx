import { Hero } from './Hero';
import { About } from './About';
import { Features } from './Features';

export default function Landing() {
  return (
    <main className="bg-black">
      <Hero />
      <About />
      <Features />
    </main>
  );
}

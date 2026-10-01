import { MotionConfig } from 'framer-motion';
import { Navigate, Route, Routes } from 'react-router-dom';
import Landing from './landing/Landing';
import { AppShell } from './app/AppShell';
import Today from './app/pages/Today';
import Syllabus from './app/pages/Syllabus';
import Streak from './app/pages/Streak';
import Review from './app/pages/Review';
import { StoreProvider } from './state/store';
import { ToastProvider } from './components/ui';

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <StoreProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Today />} />
              <Route path="syllabus" element={<Syllabus />} />
              <Route path="streak" element={<Streak />} />
              <Route path="review" element={<Review />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </StoreProvider>
    </MotionConfig>
  );
}

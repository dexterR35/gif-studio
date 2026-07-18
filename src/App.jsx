import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/error-boundary'
import { StudioProvider } from './context/studio-provider'
import { StudioLayout } from './layout/studio-layout'
import AiPage from './pages/ai-page'
import MotionPage from './pages/motion-page'
import TextPage from './pages/text-page'
import EditPage from './pages/edit-page'
import TimelinePage from './pages/timeline-page'
import ScalePage from './pages/scale-page'
import OutputPage from './pages/output-page'
import { ROUTES } from './lib/routes'

function GifApp() {
  return (
    <ErrorBoundary>
      <StudioProvider>
        <Routes>
          <Route element={<StudioLayout />}>
            <Route index element={<Navigate to="ai" replace />} />
            <Route path="ai" element={<AiPage />} />
            <Route path="motion" element={<MotionPage />} />
            <Route path="elements" element={<Navigate to="../motion" replace />} />
            <Route path="text" element={<TextPage />} />
            <Route path="frames" element={<Navigate to="../motion" replace />} />
            <Route path="edit" element={<EditPage />} />
            <Route path="timeline" element={<TimelinePage />} />
            <Route path="scale" element={<ScalePage />} />
            <Route path="output" element={<OutputPage />} />
            <Route path="preview" element={<Navigate to="../ai" replace />} />
          </Route>
        </Routes>
      </StudioProvider>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path={ROUTES.home} element={<Navigate to={ROUTES.gif.ai} replace />} />
          <Route path={`${ROUTES.gif.root}/*`} element={<GifApp />} />
          <Route path="/preview" element={<Navigate to={ROUTES.gif.ai} replace />} />
          <Route path="*" element={<Navigate to={ROUTES.gif.ai} replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

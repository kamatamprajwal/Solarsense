import "@/App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { TwinProvider, useTwin } from "@/context/TwinContext";
import Layout from "@/components/layout/Layout";
import Overview from "@/pages/Overview";
import PanelArray from "@/pages/PanelArray";
import Predictor from "@/pages/Predictor";
import MLLab from "@/pages/MLLab";
import Assistant from "@/pages/Assistant";
import Architecture from "@/pages/Architecture";

function ThemedToaster() {
  const { theme } = useTwin();
  return <Toaster theme={theme} position="bottom-right" richColors closeButton />;
}

function App() {
  return (
    <TwinProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/array" element={<PanelArray />} />
            <Route path="/predictor" element={<Predictor />} />
            <Route path="/ml-lab" element={<MLLab />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/architecture" element={<Architecture />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ThemedToaster />
    </TwinProvider>
  );
}

export default App;

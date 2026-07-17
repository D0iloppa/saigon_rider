import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import AuthPage from "./pages/auth/Index";
import NotFound from "./pages/not-found/Index";

declare const __ROUTE_MESSAGING_ENABLED__: boolean;

const Index = lazy(() => import("./pages/home/Index"));
const BusinessHome = lazy(() => import("./pages/business/Index"));
const ProductPage = lazy(() => import("./pages/home/Index").then((module) => ({ default: module.ProductPage })));
const SecurityPage = lazy(() => import("./pages/home/Index").then((module) => ({ default: module.SecurityPage })));
const SolutionsPage = lazy(() => import("./pages/home/Index").then((module) => ({ default: module.SolutionsPage })));
const HowItWorksPage = lazy(() => import("./pages/home/Index").then((module) => ({ default: module.HowItWorksPage })));
const PricingPage = lazy(() => import("./pages/home/Index").then((module) => ({ default: module.PricingPage })));
const ResourcesPage = lazy(() => import("./pages/home/Index").then((module) => ({ default: module.ResourcesPage })));
const ContactPage = lazy(() => import("./pages/home/Index").then((module) => ({ default: module.ContactPage })));
const queryClient = new QueryClient();
const routePaths = ["/", "/vi", "/ko", "/en", "/product", "/security", "/solutions", "/how-it-works", "/pricing", "/resources", "/contact", "/auth", "/*"];

let routeInfoPosted = false;
let lastRouteMessage = "";

function postRouteMessages(location: ReturnType<typeof useLocation>) {
  if (typeof window === "undefined" || typeof __ROUTE_MESSAGING_ENABLED__ === "undefined" || !__ROUTE_MESSAGING_ENABLED__ || !window.top || window.top === window) return;
  if (!routeInfoPosted) {
    window.top.postMessage({ type: "ROUTES_INFO", routes: routePaths.map((path) => ({ path })), timestamp: Date.now() }, "*");
    routeInfoPosted = true;
  }
  const fullPath = `${location.pathname}${location.search}${location.hash}`;
  if (lastRouteMessage !== fullPath) {
    window.top.postMessage({
      type: "ROUTE_CHANGE",
      path: location.pathname,
      hash: location.hash,
      search: location.search,
      fullPath,
      fullUrl: window.location.href,
      timestamp: Date.now(),
    }, "*");
    lastRouteMessage = fullPath;
  }
}

function RouteMessenger() {
  const location = useLocation();
  postRouteMessages(location);
  useEffect(() => postRouteMessages(location), [location]);
  return null;
}

const isBusinessHost = typeof window !== "undefined" && window.location.hostname.startsWith("business.");

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <RouteMessenger />
        <Suspense fallback={<div className="min-h-screen bg-background" aria-label="페이지를 불러오는 중" />}>
          {isBusinessHost ? (
            <Routes>
              <Route path="/" element={<BusinessHome />} />
              <Route path="/vi" element={<Navigate to="/" replace />} />
              <Route path="/ko" element={<BusinessHome />} />
              <Route path="/en" element={<BusinessHome />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          ) : (
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/vi" element={<Navigate to="/" replace />} />
              <Route path="/ko" element={<Index />} />
              <Route path="/en" element={<Index />} />
              <Route path="/product" element={<ProductPage />} />
              <Route path="/security" element={<SecurityPage />} />
              <Route path="/solutions" element={<SolutionsPage />} />
              <Route path="/how-it-works" element={<HowItWorksPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/resources" element={<ResourcesPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          )}
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

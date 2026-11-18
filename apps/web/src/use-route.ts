import { useEffect, useState } from "react";
import { parseRoute, type RouteId } from "./nav";

export function useRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

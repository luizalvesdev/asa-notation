import { useCallback, useEffect, useState } from "react";
import { studyApi } from "./api";
import { useDataVersion } from "./data-events";
import { localDayStartIso } from "./tasks-dates";
import type { Overview } from "./study-types";

export type LoadStatus = "carregando" | "pronto" | "erro";

export function useStudyOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [status, setStatus] = useState<LoadStatus>("carregando");
  const [version, setVersion] = useState(0);
  const dataVersion = useDataVersion();

  useEffect(() => {
    let live = true;
    studyApi
      .overview(localDayStartIso())
      .then((data) => {
        if (!live) return;
        setOverview(data);
        setStatus("pronto");
      })
      .catch(() => live && setStatus((current) => (current === "pronto" ? current : "erro")));
    return () => {
      live = false;
    };
  }, [version, dataVersion]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const retry = useCallback(() => {
    setStatus("carregando");
    setVersion((v) => v + 1);
  }, []);
  return { overview, status, reload, retry };
}

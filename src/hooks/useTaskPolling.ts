import { useEffect } from "react";
import { apiClient } from "@/lib/apiClient";

interface TaskLog {
  timestamp: string;
  timestamp_precise?: number;
  message: string;
  level: 'INFO' | 'SUCCESS' | 'ERROR' | 'WARNING' | 'DEBUG';
}

interface UseTaskPollingOptions {
  activeTaskId: string | null;
  onStatusUpdate: (data: any) => void;
  onLogsUpdate: (logs: TaskLog[]) => void;
  onComplete: (logs: TaskLog[]) => Promise<void>;
}

export function useTaskPolling({
  activeTaskId,
  onStatusUpdate,
  onLogsUpdate,
  onComplete,
}: UseTaskPollingOptions) {
  useEffect(() => {
    if (!activeTaskId) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiClient(`/api/task/${activeTaskId}`);
        const data = await res.json();
        onStatusUpdate(data);

        try {
          const logsRes = await apiClient(`/api/task/${activeTaskId}/logs`);
          const logsData: TaskLog[] = await logsRes.json();
          if (logsData && logsData.length > 0) {
            onLogsUpdate(logsData);
          }
        } catch (logErr) {
          console.error("Erro ao buscar logs realtime:", logErr);
        }

        const isFinished =
          data.status === "completed" ||
          data.status === "error" ||
          data.status === "CONCLUIDO" ||
          data.status === "CONCLUIDO_COM_RESSALVAS" ||
          data.status === "STOPPED" ||
          data.status === "cancelled";

        if (isFinished) {
          clearInterval(interval);

          let finalLogs: TaskLog[] = [];
          try {
            const logsRes = await apiClient(`/api/task/${activeTaskId}/logs`);
            const logsData: TaskLog[] = await logsRes.json();
            if (logsData && logsData.length > 0) {
              finalLogs = logsData;
            }
          } catch (logErr) {
            console.error("Erro ao buscar logs finais:", logErr);
          }

          await onComplete(finalLogs);
        }
      } catch (err) {
        console.error("Erro polling status:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeTaskId]); // eslint-disable-line react-hooks/exhaustive-deps
}

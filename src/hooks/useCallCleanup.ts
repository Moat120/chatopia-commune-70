import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CLEANUP_INTERVAL = 60000; // 1 minute
const CALL_TIMEOUT = 60000; // 60 seconds - calls ringing for more than this are auto-declined

export const useCallCleanup = () => {
  const { user } = useAuth();
  const cleanupRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!user) return;

    const cleanupStaleCalls = async () => {
      try {
        const cutoffTime = new Date(Date.now() - CALL_TIMEOUT).toISOString();
        
        // Clean up calls that have been ringing for too long
        await supabase
          .from("private_calls")
          .update({ 
            status: "missed", 
            ended_at: new Date().toISOString() 
          })
          .eq("status", "ringing")
          .lt("created_at", cutoffTime);

        // Clean up calls that are "active" but haven't been updated in 5 minutes
        // (likely abandoned connections)
        const abandonedCutoff = new Date(Date.now() - 5 * 60000).toISOString();
        await supabase
          .from("private_calls")
          .update({ 
            status: "ended", 
            ended_at: new Date().toISOString() 
          })
          .eq("status", "active")
          .lt("started_at", abandonedCutoff);

        // Clean up group calls that have been inactive
        await supabase
          .from("group_calls")
          .update({ 
            status: "ended", 
            ended_at: new Date().toISOString() 
          })
          .eq("status", "active")
          .lt("started_at", abandonedCutoff);
          
      } catch (error) {
        console.error("[CallCleanup] Error cleaning up calls:", error);
      }
    };

    // Run cleanup immediately
    cleanupStaleCalls();

    // Run cleanup periodically
    cleanupRef.current = setInterval(cleanupStaleCalls, CLEANUP_INTERVAL);

    return () => {
      if (cleanupRef.current) {
        clearInterval(cleanupRef.current);
        cleanupRef.current = null;
      }
    };
  }, [user]);
};

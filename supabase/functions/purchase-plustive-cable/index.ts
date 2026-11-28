import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handlePurchase } from "./handler.ts";

serve(handlePurchase);

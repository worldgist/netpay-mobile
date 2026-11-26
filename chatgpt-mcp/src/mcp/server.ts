import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthedSession } from "../oauth/tokens.js";
import { WIDGETS } from "../widgets/html.js";
import * as readTools from "../tools/read.js";
import * as prepareTools from "../tools/prepare.js";
import * as confirmTools from "../tools/confirm.js";
import type { ToolContext } from "../tools/context.js";

export function createMcpServer(session: AuthedSession, ip?: string | null): McpServer {
  const server = new McpServer({
    name: "netpay",
    version: "1.0.0",
  });

  const ctx: ToolContext = { session, ip };

  // Register widgets as resources
  for (const widget of Object.values(WIDGETS)) {
    server.registerResource(
      widget.name,
      widget.uri,
      { mimeType: "text/html+skybridge", description: widget.name },
      async () => ({
        contents: [
          {
            uri: widget.uri,
            mimeType: "text/html+skybridge",
            text: widget.html,
          },
        ],
      }),
    );
  }

  server.registerTool(
    "get_profile",
    {
      title: "Get NetPay profile",
      description: "Return the linked NetPay user profile (name, email, phone).",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => readTools.getProfile(ctx),
  );

  server.registerTool(
    "get_wallet_balance",
    {
      title: "Get wallet balance",
      description: "Return the user's NetPay wallet/ledger balance in NGN.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => readTools.getWalletBalance(ctx),
  );

  server.registerTool(
    "get_funding_details",
    {
      title: "Get funding account details",
      description: "Return Flutterwave virtual account details for funding the NetPay wallet.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => readTools.getFundingDetails(ctx),
  );

  server.registerTool(
    "list_transactions",
    {
      title: "List recent transactions",
      description: "List recent NetPay wallet, purchase, and transfer activity.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional().describe("Max items (default 20)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => readTools.listTransactions(ctx, args),
  );

  server.registerTool(
    "get_transaction",
    {
      title: "Get transaction details",
      description: "Fetch a single NetPay transaction by id (optionally with category).",
      inputSchema: {
        id: z.string().describe("Transaction UUID"),
        category: z
          .string()
          .optional()
          .describe("Optional category hint: airtime, data, electricity, cable, education, wallet, transfer, funding"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => readTools.getTransaction(ctx, args),
  );

  server.registerTool(
    "prepare_airtime_purchase",
    {
      title: "Prepare airtime purchase",
      description:
        "Validate and stage an airtime purchase. Does NOT debit. Call confirm_transaction after the user confirms.",
      inputSchema: {
        phone_number: z.string().describe("Recipient phone number"),
        network: z.string().describe("MTN, AIRTEL, GLO, or 9MOBILE"),
        amount: z.number().describe("Airtime amount in NGN (50–50000)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => prepareTools.prepareAirtimePurchase(ctx, args),
  );

  server.registerTool(
    "prepare_data_purchase",
    {
      title: "Prepare data purchase",
      description:
        "Stage a data plan purchase. Does NOT debit. Confirm with confirm_transaction.",
      inputSchema: {
        phone_number: z.string(),
        plan_id: z.string().describe("NetPay data plan UUID"),
        network: z.string().optional(),
        plan_name: z.string().optional(),
        amount: z.number().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => prepareTools.prepareDataPurchase(ctx, args),
  );

  server.registerTool(
    "prepare_electricity_payment",
    {
      title: "Prepare electricity payment",
      description:
        "Validate meter and stage electricity payment. Does NOT debit until confirm_transaction.",
      inputSchema: {
        meter_number: z.string(),
        provider: z.string().describe("Disco / provider code"),
        meter_type: z.string().describe("prepaid or postpaid"),
        amount: z.number(),
        customer_name: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => prepareTools.prepareElectricityPayment(ctx, args),
  );

  server.registerTool(
    "prepare_cable_payment",
    {
      title: "Prepare cable TV payment",
      description:
        "Validate smartcard and stage cable renewal. Requires plan_id, package_name, and catalog amount. Confirm with confirm_transaction.",
      inputSchema: {
        smartcard_number: z.string(),
        provider: z.string().describe("DSTV, GOTV, STARTIMES, …"),
        plan_id: z.string(),
        package_name: z.string(),
        amount: z.number().describe("Package price in NGN (must match NetPay catalog)"),
        customer_name: z.string().optional(),
        customer_number: z.string().optional(),
        api_code: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => prepareTools.prepareCablePayment(ctx, args),
  );

  server.registerTool(
    "prepare_education_purchase",
    {
      title: "Prepare education PIN purchase",
      description: "Stage WAEC/NECO/JAMB PIN purchase. Confirm with confirm_transaction.",
      inputSchema: {
        exam_type: z.string(),
        amount: z.number(),
        quantity: z.number().int().optional(),
        phone_number: z.string().optional(),
        billers_code: z.string().optional(),
        education_service_id: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => prepareTools.prepareEducationPurchase(ctx, args),
  );

  server.registerTool(
    "prepare_transfer",
    {
      title: "Prepare NetPay transfer",
      description:
        "Verify recipient and stage an in-app transfer. Does NOT send money until confirm_transaction.",
      inputSchema: {
        recipient_email: z.string().email(),
        amount: z.number(),
        description: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => prepareTools.prepareTransfer(ctx, args),
  );

  server.registerTool(
    "confirm_transaction",
    {
      title: "Confirm pending transaction",
      description:
        "Execute a previously prepared money movement using confirmation_id. Single-use; sends idempotency_key to NetPay edge APIs.",
      inputSchema: {
        confirmation_id: z.string().uuid(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async (args) => confirmTools.confirmTransaction(ctx, args),
  );

  server.registerTool(
    "disconnect_account",
    {
      title: "Disconnect NetPay",
      description: "Revoke ChatGPT OAuth tokens for this NetPay account.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async () => confirmTools.disconnectAccount(ctx),
  );

  return server;
}

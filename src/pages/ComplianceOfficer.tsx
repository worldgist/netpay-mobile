import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { ShieldCheck, AlertTriangle, FileText, CheckCircle2 } from "lucide-react";

const complianceReports = [
  {
    title: "NDPR Audit – Q4 2025",
    summary: "Review of data processing activities, consent records and breach response procedures.",
    status: "Completed",
    lastUpdated: "05 Nov, 2025",
    details: [
      "Verified lawful basis for data processing across all products.",
      "Updated consent log retention policy to 24 months.",
      "Incident response tabletop exercise completed with CS and Engineering.",
    ],
  },
  {
    title: "PCI DSS Gap Analysis",
    summary: "Payment data flow mapping, tokenisation strategy and remediation roadmap.",
    status: "In Progress",
    lastUpdated: "08 Nov, 2025",
    details: [
      "Tokenisation service deployment staged for week 47.",
      "Firewall rule review pending with Infrastructure team.",
      "Evidence collection for Requirement 10 (logging) in progress.",
    ],
  },
  {
    title: "AML & CFT Controls Review",
    summary: "KYC verification checks, transaction monitoring and suspicious activity escalation.",
    status: "Scheduled",
    lastUpdated: "15 Nov, 2025",
    details: [
      "Scope includes agent onboarding, wallet limits and SAR workflows.",
      "Prepare transaction monitoring dashboard extracts for regulators.",
    ],
  },
];

const incidentLog = [
  {
    date: "09 Nov, 2025",
    severity: "Low",
    title: "Incorrect OTP retry threshold",
    action: "Updated threshold from 7 to 5 retries. No customer impact.",
  },
  {
    date: "02 Nov, 2025",
    severity: "Medium",
    title: "Agent device compromise attempt",
    action: "Blocked IP, forced device lock, rotated credentials and notified agent lead.",
  },
  {
    date: "27 Oct, 2025",
    severity: "High",
    title: "Bulk airtime purchase anomaly",
    action: "Triggered manual review, refunded affected wallet and submitted report to regulator.",
  },
];

const policyDocuments = [
  {
    name: "Information Security Policy",
    version: "v3.2",
    link: "#",
  },
  {
    name: "Data Protection & Privacy Policy",
    version: "v2.6",
    link: "#",
  },
  {
    name: "Anti-Money Laundering (AML) Policy",
    version: "v1.9",
    link: "#",
  },
  {
    name: "EFCC SCUML Registration Certificate",
    version: "v1.0",
    link: "#",
  },
];

const ComplianceOfficer = () => {
  const [note, setNote] = useState("");
  const [selectedReport, setSelectedReport] = useState<(typeof complianceReports)[number] | null>(null);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <section className="container mx-auto px-4 py-16 space-y-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-brand uppercase tracking-[0.3em] text-xs">
              <ShieldCheck className="w-4 h-4" />
              Compliance Officer Workspace
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              Monitor regulatory controls, audits and incidents.
            </h1>
            <p className="text-muted-foreground max-w-2xl">
              Stay ahead of NDPR, AML/CFT and PCI requirements. Log incidents, track audit status and coordinate
              remediation tasks directly from NetPay’s admin portal.
            </p>
          </div>
          <Button className="bg-brand text-white hover:bg-brand/90 px-6">Download Compliance Checklist</Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-8">
          <TabsList className="bg-card/80 border border-border/40 rounded-xl p-1">
            <TabsTrigger value="overview" className="text-sm">Overview</TabsTrigger>
            <TabsTrigger value="audits" className="text-sm">Audits & Reports</TabsTrigger>
            <TabsTrigger value="incidents" className="text-sm">Incident Response</TabsTrigger>
            <TabsTrigger value="policies" className="text-sm">Policies & Evidence</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Compliance Snapshot</CardTitle>
                <CardDescription>Review central metrics and ongoing tasks.</CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-4 gap-4">
                {[
                  { label: "Regulatory Audits", value: "3 active", caption: "NDPR, PCI DSS, AML" },
                  { label: "Open Findings", value: "5", caption: "2 remediation tasks in progress" },
                  { label: "Incidents (90 days)", value: "4", caption: "No customer data exposed" },
                  { label: "Employee Training", value: "98%", caption: "Annual compliance training complete" },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-border/30 bg-card/70 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="text-2xl font-semibold text-foreground">{item.value}</p>
                    <p className="text-xs text-muted-foreground">{item.caption}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audits" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Regulatory Audits & Assessments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {complianceReports.map((report) => (
                  <div
                    key={report.title}
                    className="border border-border/30 rounded-2xl bg-card/70 px-4 py-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{report.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{report.summary}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Last updated: {report.lastUpdated}</span>
                      <Badge variant="outline">{report.status}</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setSelectedReport(report);
                          setIsReportDialogOpen(true);
                        }}
                      >
                        View details
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Leave internal notes</CardTitle>
                <CardDescription>Document follow-ups, clarifications or regulator communications.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Note to team…"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
                <Button className="bg-brand text-white hover:bg-brand/90 px-6" disabled={!note.trim()}>
                  Save note
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="incidents" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Incident Response Log</CardTitle>
                <CardDescription>Document every security or compliance event, actions and outcomes.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {incidentLog.map((incident) => (
                  <div
                    key={incident.title}
                    className="border border-border/30 rounded-2xl bg-card/70 px-4 py-4 shadow-sm flex flex-col gap-2"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{incident.title}</p>
                        <p className="text-xs text-muted-foreground">Logged: {incident.date}</p>
                      </div>
                      <Badge
                        variant={incident.severity === "High" ? "destructive" : incident.severity === "Medium" ? "secondary" : "outline"}
                      >
                        {incident.severity} Severity
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{incident.action}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Report new incident</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <Input placeholder="Incident title" />
                  <Input placeholder="Severity (Low, Medium, High)" />
                </div>
                <Textarea placeholder="Incident details, systems impacted, remediation steps…" />
                <Button className="bg-brand text-white hover:bg-brand/90 px-6">Submit incident</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="policies" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Policies & Evidence Repository</CardTitle>
                <CardDescription>Access the latest policy documents and evidence packs.</CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                {policyDocuments.map((policy) => (
                  <div key={policy.name} className="border border-border/30 rounded-2xl bg-card/70 p-5 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">{policy.name}</h3>
                      <Badge variant="outline">{policy.version}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Updated {new Date().toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                    <Button variant="outline" size="sm" className="text-xs" asChild>
                      <a href={policy.link}>Download PDF</a>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Compliance checklist</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand" />
                  NDPR audit completed (Q4 2025)
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand" />
                  Automatic transaction monitoring rules refreshed
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  PCI DSS remediation tasks pending (target: 15 Dec 2025)
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>

      <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedReport?.title ?? "Audit details"}</DialogTitle>
            <DialogDescription>
              {selectedReport
                ? `Status: ${selectedReport.status} · Last updated ${selectedReport.lastUpdated}`
                : "Detailed breakdown of this compliance activity."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>{selectedReport?.summary}</p>
            <ul className="list-disc list-inside space-y-2">
              {(selectedReport?.details ?? []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="flex items-center justify-end">
            <Button variant="outline" onClick={() => setIsReportDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ComplianceOfficer;


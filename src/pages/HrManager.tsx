import { FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Users, Coins, FileText, CheckCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { useCallback } from "react";

const generateEmployeeId = () => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const sequence = Math.floor(1000 + Math.random() * 9000);
  return `NET-${year}${month}${day}-${sequence}`;
};

const sampleStaff = [
  {
    name: "Amina Bello",
    role: "Customer Success Lead",
    team: "Support",
    status: "Active",
    lastLogin: "10 Nov, 2025 · 09:14",
    email: "amina.bello@netpay.ng",
    startDate: "2023-06-15",
    employeeId: "NET-230615-1254",
    address: "12 Admiralty Way, Lekki Phase 1",
    state: "Lagos",
    salaryBand: "Band A",
    bankName: "GTBank",
    bankAccount: "0123456789",
  },
  {
    name: "Chinedu Okafor",
    role: "Senior Frontend Engineer",
    team: "Product",
    status: "Active",
    lastLogin: "09 Nov, 2025 · 20:05",
    email: "chinedu.okafor@netpay.ng",
    startDate: "2022-09-01",
    employeeId: "NET-220901-4571",
    address: "4 Admiralty Close, Lekki",
    state: "Lagos",
    salaryBand: "Band C",
    bankName: "Access Bank",
    bankAccount: "0234567890",
  },
  {
    name: "Sarah Adeyemi",
    role: "Settlement Manager",
    team: "Finance",
    status: "On Leave",
    lastLogin: "30 Oct, 2025 · 17:45",
    email: "sarah.adeyemi@netpay.ng",
    startDate: "2021-11-22",
    employeeId: "NET-211122-7843",
    address: "15 Glover Road, Ikoyi",
    state: "Lagos",
    salaryBand: "Band B",
    bankName: "Zenith Bank",
    bankAccount: "0345678901",
  },
];

const jobOpenings = [
  {
    title: "Product Designer",
    team: "Product · Hybrid – Lagos",
    applicants: 32,
    status: "Screening",
  },
  {
    title: "QA Engineer",
    team: "Engineering · Remote – Nigeria",
    applicants: 18,
    status: "Interviewing",
  },
  {
    title: "People Operations Associate",
    team: "People · Hybrid – Lagos",
    applicants: 45,
    status: "Accepting",
  },
];

const applicantsByOpening: Record<
  string,
  { name: string; stage: string; submitted: string; note?: string }[]
> = {
  "Product Designer": [
    { name: "Ifeoma O.", stage: "Portfolio Review", submitted: "09 Nov, 2025" },
    { name: "Kemi A.", stage: "Interview Scheduled", submitted: "05 Nov, 2025" },
  ],
  "QA Engineer": [
    { name: "Fisayo B.", stage: "Technical Task", submitted: "08 Nov, 2025" },
    { name: "Chukwuemeka T.", stage: "Phone Screen", submitted: "03 Nov, 2025" },
  ],
  "People Operations Associate": [
    { name: "Tamara E.", stage: "Offer in Progress", submitted: "06 Nov, 2025" },
    { name: "Saidu R.", stage: "Initial Screening", submitted: "04 Nov, 2025" },
  ],
};

const salaryStructures = [
  {
    band: "Band A",
    roles: "Customer Support, Teller Agents",
    range: "₦80k – ₦140k",
    bonus: "Quarterly performance bonuses up to 10%",
  },
  {
    band: "Band B",
    roles: "Operations, Finance, Product Analysts",
    range: "₦200k – ₦400k",
    bonus: "Annual bonus up to 18%, meal allowance, transport stipend",
  },
  {
    band: "Band C",
    roles: "Senior Engineers, Product Leads, Managers",
    range: "₦450k – ₦900k",
    bonus: "Annual bonus up to 25%, health cover, stock options, education allowance",
  },
  {
    band: "Band D",
    roles: "Executives, Directors",
    range: "₦1.2m+",
    bonus: "Performance bonus up to 35%, long-term incentives, housing benefit, executive health cover",
  },
];

const jobDescriptionTemplates = [
  {
    title: "Senior Frontend Engineer",
    summary:
      "Design and build delightful user experiences for Web, Android and iOS. Collaborate with product, design and QA to ship features that simplify bill payments across Nigeria.",
    responsibilities: [
      "Own frontend architecture and component libraries for NetPay’s portals.",
      "Coach junior engineers and uphold clean code, accessibility and performance.",
      "Collaborate with product, design and QA to deliver roadmap initiatives.",
    ],
    requirements: [
      "5+ years building React/React Native applications.",
      "Demonstrated ability to ship delightful product experiences.",
      "Passion for building payments or fintech experiences in emerging markets.",
    ],
  },
  {
    title: "Customer Success Lead",
    summary:
      "Champion our merchants, agents and enterprises. Solve issues quickly, provide proactive insights and drive satisfaction across every NetPay touchpoint.",
    responsibilities: [
      "Lead support operations across email, phone and WhatsApp.",
      "Develop playbooks that reduce escalation time and boost CSAT.",
      "Partner with product and engineering to relay voice-of-customer insights.",
    ],
    requirements: [
      "4+ years in customer-facing roles within fintech, payments or SaaS.",
      "Exceptional communication skills and empathy.",
      "Experience managing distributed teams and shift rotations.",
    ],
  },
];

const recruitmentWorkflow = [
  {
    stage: "Application Intake",
    description: "Candidates submit CV/portfolio. Automatic acknowledgement sent instantly.",
  },
  {
    stage: "Screening",
    description: "HR reviews profile, experience and qualification fit against open role templates.",
  },
  {
    stage: "Technical & Behavioural Interviews",
    description: "Hiring manager and panel assess skills, teamwork and problem-solving.",
  },
  {
    stage: "Decision & Offer",
    description:
      "Debriefs captured in NetPay HR workspace. Compensation recommendations pull from salary structures and bonus guidelines before extending an offer.",
  },
];

const HrManager = () => {
  const [filter, setFilter] = useState("");
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [isApplicantsOpen, setIsApplicantsOpen] = useState(false);
  const [isLetterOpen, setIsLetterOpen] = useState(false);
  const [isEditEmployeeOpen, setIsEditEmployeeOpen] = useState(false);
  const [editingEmployeeIndex, setEditingEmployeeIndex] = useState<number | null>(null);
  const [selectedOpening, setSelectedOpening] = useState<typeof jobOpenings[0] | null>(null);
  const [staff, setStaff] = useState(sampleStaff);
  const [newEmployee, setNewEmployee] = useState({
    name: "",
    role: "",
    team: "",
    email: "",
    startDate: "",
    notes: "",
    employeeId: generateEmployeeId(),
    photo: null as File | null,
    address: "",
    state: "",
    salaryBand: "",
    bankName: "",
    bankAccount: "",
  });
  const { toast } = useToast();
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const filteredStaff = useMemo(
    () =>
      staff.filter(
        (member) =>
          member.name.toLowerCase().includes(filter.toLowerCase()) ||
          member.role.toLowerCase().includes(filter.toLowerCase()) ||
          member.team.toLowerCase().includes(filter.toLowerCase())
      ),
    [staff, filter]
  );

  const handleAddEmployee = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStaff((prev) => [
      {
        name: newEmployee.name,
        role: newEmployee.role,
        team: newEmployee.team,
        status: "Active",
        lastLogin: "Just added",
        email: newEmployee.email,
        startDate: newEmployee.startDate,
        employeeId: newEmployee.employeeId,
        address: newEmployee.address,
        state: newEmployee.state,
        salaryBand: newEmployee.salaryBand,
        bankName: newEmployee.bankName,
        bankAccount: newEmployee.bankAccount,
      },
      ...prev,
    ]);
    toast({
      title: "Employee captured",
      description: `${newEmployee.name || "New teammate"} (${newEmployee.employeeId}) has been queued for onboarding.`,
    });
    setNewEmployee({
      name: "",
      role: "",
      team: "",
      email: "",
      startDate: "",
      notes: "",
      employeeId: generateEmployeeId(),
      photo: null,
      address: "",
      state: "",
      salaryBand: "",
      bankName: "",
      bankAccount: "",
    });
    setPhotoPreview(null);
    setIsAddEmployeeOpen(false);
  };

  const handleEditEmployee = (index: number) => {
    const employee = filteredStaff[index];
    const absoluteIndex = staff.findIndex((member) => member.employeeId === employee.employeeId);
    setEditingEmployeeIndex(absoluteIndex);
    setNewEmployee({
      name: employee.name,
      role: employee.role,
      team: employee.team,
      email: employee.email,
      startDate: employee.startDate,
      notes: "",
      employeeId: employee.employeeId,
      photo: null,
    address: employee.address || "",
    state: employee.state || "",
      salaryBand: employee.salaryBand || "",
      bankName: employee.bankName || "",
      bankAccount: employee.bankAccount || "",
    });
    setPhotoPreview(null);
    setIsEditEmployeeOpen(true);
  };

  const handleSaveEditedEmployee = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editingEmployeeIndex === null) return;
    setStaff((prev) => {
      const updated = [...prev];
      updated[editingEmployeeIndex] = {
        ...updated[editingEmployeeIndex],
        name: newEmployee.name,
        role: newEmployee.role,
        team: newEmployee.team,
        email: newEmployee.email,
        startDate: newEmployee.startDate,
        address: newEmployee.address,
        state: newEmployee.state,
        salaryBand: newEmployee.salaryBand,
        bankName: newEmployee.bankName,
        bankAccount: newEmployee.bankAccount,
      };
      return updated;
    });
    toast({
      title: "Employee updated",
      description: `${newEmployee.name} has been updated successfully.`,
    });
    setIsEditEmployeeOpen(false);
    setEditingEmployeeIndex(null);
  };

  const totalAnnualBonusBudget = useMemo(() => {
    const totalStaff = staff.length;
    const averageBonus = 0.18; // illustrative average bonus rate
    return `~₦${(totalStaff * 300000 * averageBonus).toLocaleString("en-NG", {
      maximumFractionDigits: 0,
    })}`;
  }, []);

  const printLetter = useCallback(() => {
    const printContents = document.getElementById("netpay-offer-letter")?.innerHTML;
    if (!printContents) {
      toast({ title: "Unable to print", description: "Offer letter preview is not available." });
      return;
    }
    const printWindow = window.open("", "PRINT", "height=720,width=1024");
    if (!printWindow) return;
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>NetPay Appointment Letter</title>
          <style>
            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; margin: 40px; }
            h1, h2, h3 { color: #111827; }
            .logo { width: 72px; height: 72px; border-radius: 16px; border: 1px solid #E5E7EB; padding: 8px; }
            .brand { color: #FF6B00; }
            .section { margin-top: 24px; }
            .footer { margin-top: 48px; }
          </style>
        </head>
        <body onload="window.print();window.close()">
          ${printContents}
        </body>
      </html>
    `);
    printWindow.document.close();
  }, [toast]);

  return (
    <div className="min-h-screen bg-background">
      <section className="container mx-auto px-4 py-16 space-y-12">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-brand uppercase tracking-[0.3em] text-xs">
              <Users className="w-4 h-4" />
              HR Manager
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">Manage your NetPay workforce</h1>
            <p className="text-muted-foreground max-w-2xl">
              Onboard teammates, monitor onboarding progress, track leave, and keep your talent pipeline organised—all from the
              NetPay admin workspace.
            </p>
          </div>
          <Button
            className="bg-brand text-white hover:bg-brand/90 px-6"
            onClick={() => {
              setNewEmployee({
                name: "",
                role: "",
                team: "",
                email: "",
                startDate: "",
                notes: "",
                employeeId: generateEmployeeId(),
                photo: null,
                address: "",
                state: "",
                salaryBand: "",
                bankName: "",
                bankAccount: "",
              });
              setPhotoPreview(null);
              setIsAddEmployeeOpen(true);
            }}
          >
            Add New Employee
          </Button>
        </div>

        <Tabs defaultValue="staff" className="space-y-8">
          <TabsList className="bg-card/80 border border-border/40 rounded-xl p-1">
            <TabsTrigger value="staff" className="text-sm">Staff Directory</TabsTrigger>
            <TabsTrigger value="recruitment" className="text-sm">Recruitment & Hiring</TabsTrigger>
            <TabsTrigger value="approvals" className="text-sm">Leave & Approvals</TabsTrigger>
            <TabsTrigger value="compensation" className="text-sm">Compensation</TabsTrigger>
            <TabsTrigger value="job-descriptions" className="text-sm">Job Descriptions</TabsTrigger>
            <TabsTrigger value="pipeline" className="text-sm">Talent Pipeline</TabsTrigger>
          </TabsList>

          <TabsContent value="staff" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <CardTitle className="text-lg">Team Members</CardTitle>
                <Input
                  placeholder="Search by name, role or team…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="w-full md:w-72"
                />
              </CardHeader>
              <CardContent className="space-y-3">
                {filteredStaff.map((member, idx) => (
                  <div
                    key={member.employeeId}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-border/30 rounded-2xl bg-card/70 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        {member.role} · {member.team}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{member.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Employee ID: <span className="font-mono">{member.employeeId}</span>
                      </p>
                    {member.address && (
                      <p className="text-xs text-muted-foreground">Address: {member.address}</p>
                    )}
                    {member.state && (
                      <p className="text-xs text-muted-foreground">State: {member.state}</p>
                    )}
                    {(member.salaryBand || member.bankName || member.bankAccount) && (
                      <div className="mt-2 text-xs text-muted-foreground space-y-1">
                        {member.salaryBand && (
                          <p>
                            Salary Band: <span className="text-foreground font-medium">{member.salaryBand}</span>
                          </p>
                        )}
                        {(member.bankName || member.bankAccount) && (
                          <p>
                            Bank: <span className="text-foreground font-medium">{member.bankName || "—"}</span> • Account:{" "}
                            <span className="font-mono">{member.bankAccount || "—"}</span>
                          </p>
                        )}
                      </div>
                    )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={member.status === "Active" ? "default" : "secondary"}
                        className="bg-brand/10 text-brand"
                      >
                        {member.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground text-right">
                        Last active: {member.lastLogin}
                        <br />
                        Start date: {member.startDate || "—"}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleEditEmployee(idx)}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recruitment" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Open Roles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {jobOpenings.map((opening) => (
                  <div
                    key={opening.title}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-border/30 rounded-2xl bg-card/70 px-4 py-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{opening.title}</p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">{opening.team}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{opening.applicants} applicants</span>
                      <Badge variant="outline" className="text-xs">
                        {opening.status}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setSelectedOpening(opening);
                          setIsApplicantsOpen(true);
                        }}
                      >
                        View applicants
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recruitment Pipeline</CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-4">
                {[
                  { stage: "Applications", count: 96, change: "+12 this week" },
                  { stage: "Interviews", count: 22, change: "+4 this week" },
                  { stage: "Offers", count: 5, change: "+1 this week" },
                ].map((metric) => (
                  <div key={metric.stage} className="rounded-2xl border border-border/30 bg-card/70 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{metric.stage}</p>
                    <p className="text-2xl font-semibold text-foreground">{metric.count}</p>
                    <p className="text-xs text-muted-foreground">{metric.change}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approvals" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pending Requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  {
                    staff: "Sarah Adeyemi",
                    request: "Annual Leave (10 days)",
                    submitted: "08 Nov, 2025",
                  },
                  {
                    staff: "Chinedu Okafor",
                    request: "Training Allowance",
                    submitted: "07 Nov, 2025",
                  },
                ].map((item) => (
                  <div
                    key={item.staff}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-border/30 rounded-2xl bg-card/70 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.staff}</p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        {item.request}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">Submitted: {item.submitted}</span>
                      <Button variant="outline" size="sm" className="text-xs">
                        Review
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">HR Analytics Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-4">
                {[
                  { label: "Headcount", value: "68", caption: "NetPay HQ, agents & remote" },
                  { label: "Retention Rate", value: "94%", caption: "Trailing 12 months" },
                  { label: "Average Tenure", value: "2.4 yrs", caption: "Across all departments" },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-2xl border border-border/30 bg-card/70 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                    <p className="text-2xl font-semibold text-foreground">{metric.value}</p>
                    <p className="text-xs text-muted-foreground">{metric.caption}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compensation" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Coins className="w-4 h-4 text-brand" />
                  Salary Structures & Bonus Policy
                </CardTitle>
                <CardDescription>
                  Align compensation with role levels, skills and responsibilities. Adjust ranges as the market evolves.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-6">
                {salaryStructures.map((band) => (
                  <div key={band.band} className="border border-border/30 rounded-2xl bg-card/70 p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">{band.band}</h3>
                      <Badge variant="outline">{band.range}</Badge>
                    </div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{band.roles}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{band.bonus}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Bonus & Recognition</CardTitle>
                <CardDescription>
                  Manage variable compensation and recognition programs that reward performance and boost retention.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-border/30 bg-card/70 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Annual Bonus Budget</p>
                  <p className="text-2xl font-semibold text-foreground">{totalAnnualBonusBudget}</p>
                  <p className="text-xs text-muted-foreground">Based on current headcount and bands</p>
                </div>
                <div className="rounded-2xl border border-border/30 bg-card/70 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Recognition Programs</p>
                  <ul className="text-xs text-muted-foreground space-y-1 mt-2">
                    <li>• Quarterly performance bonuses</li>
                    <li>• Spot bonuses for incident response</li>
                    <li>• Referral incentives for new hires</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-border/30 bg-card/70 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Payroll Cycle</p>
                  <p className="text-2xl font-semibold text-foreground">Monthly</p>
                  <p className="text-xs text-muted-foreground">Due on the 25th with automated payslips</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="job-descriptions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand" />
                  Job Description Templates
                </CardTitle>
                <CardDescription>
                  Use these templates to maintain clarity and consistency across postings and internal promotions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {jobDescriptionTemplates.map((template) => (
                  <div key={template.title} className="border border-border/30 rounded-2xl bg-card/70 p-6 shadow-sm space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{template.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{template.summary}</p>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">Key Responsibilities</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {template.responsibilities.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">Requirements</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {template.requirements.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-3">
                      <Button variant="outline" size="sm">
                        Copy template
                      </Button>
                      <Button size="sm" className="bg-brand text-white hover:bg-brand/90">
                        Export to PDF
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-brand" />
                  Candidate Pipeline
                </CardTitle>
                <CardDescription>
                  Track the status of every candidate—from application to offer—in one consolidated workflow.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-4 gap-4">
                {recruitmentWorkflow.map((stage) => (
                  <div key={stage.stage} className="rounded-2xl border border-border/30 bg-card/70 p-4 shadow-sm space-y-2">
                    <div className="text-sm font-semibold text-foreground">{stage.stage}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{stage.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Screening & Interviews</CardTitle>
                <CardDescription>
                  Maintain a consistent, fair and transparent evaluation process for every candidate.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-4">
                <div className="border border-border/30 rounded-2xl bg-card/70 p-4 shadow-sm space-y-2">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Screening Checklist</h3>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Verify years of experience and relevant projects</li>
                    <li>• Check cultural fit and alignment with NetPay values</li>
                    <li>• Validate compensation expectations with salary bands</li>
                  </ul>
                </div>
                <div className="border border-border/30 rounded-2xl bg-card/70 p-4 shadow-sm space-y-2">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Interview Guidelines</h3>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Assign interviewer panels and share structured questions</li>
                    <li>• Capture notes in NetPay HR workspace for each round</li>
                    <li>• Provide feedback to candidates within 48 hours</li>
                  </ul>
                </div>
                <div className="border border-border/30 rounded-2xl bg-card/70 p-4 shadow-sm space-y-2">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Selection & Offers</h3>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Review candidate scorecards and panel feedback</li>
                    <li>• Align compensation with salary structures and bonus policy</li>
                    <li>• Trigger onboarding tasks for IT, finance and managers</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="offer-letter" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-lg">Appointment Letter Template</CardTitle>
                  <CardDescription>Preview the standard NetPay appointment letter. Print or export for new hires.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => setIsLetterOpen(true)}>
                    Customize Template
                  </Button>
                  <Button className="bg-brand text-white hover:bg-brand/90" onClick={printLetter}>
                    Print Letter
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="bg-card/70 border border-border/30 rounded-3xl p-8" id="netpay-offer-letter">
                <div className="flex items-center gap-3">
                  <img
                    src="/logo.png"
                    alt="NetPay"
                    className="w-16 h-16 rounded-xl border border-border/30 shadow-sm"
                  />
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      NetPay Technology Limited
                    </h2>
                    <p className="text-sm text-muted-foreground">5B Innovation Drive, Lekki Phase I, Lagos.</p>
                  </div>
                </div>

                <Separator className="my-6" />

                <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                  <p>12 November 2025</p>
                  <p>
                    <strong className="text-foreground">Dear [Candidate Name],</strong>
                  </p>
                  <p>
                    We are thrilled to offer you the position of <strong className="text-foreground">[Position Title]</strong> with NetPay. Your skills,
                    experience and passion for creating delightful bill payment experiences stood out during our interview process.
                  </p>
                  <p>
                    Your start date will be <strong className="text-foreground">[Start Date]</strong> at <strong className="text-foreground">[Location / Hybrid Arrangement]</strong>.
                    You will report directly to <strong className="text-foreground">[Manager Name]</strong> and collaborate closely with our
                    [Team/Department] team.
                  </p>
                  <p>
                    Compensation includes a monthly salary of <strong className="text-foreground">[Salary]</strong> within our Band [Band] structure.
                    You are eligible for performance bonuses, health insurance, paid time off, and additional benefits outlined in the enclosed HR handbook.
                  </p>

                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                      Next Steps
                    </h3>
                    <ol className="space-y-1 pl-5 list-decimal">
                      <li>Sign and return this letter by <strong className="text-foreground">[Acceptance Deadline]</strong>.</li>
                      <li>Complete onboarding forms (ID, payroll, compliance) before your start date.</li>
                      <li>Attend the NetPay orientation session on <strong className="text-foreground">[Orientation Date]</strong>.</li>
                    </ol>
                  </div>

                  <p>
                    Welcome to the family! We are excited to build the future of payments in Nigeria with you.
                  </p>
                  <p>Warm regards,</p>
                </div>

                <div className="mt-10">
                  <p className="text-sm text-foreground font-semibold">Emeka Nwachukwu</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Head of People, NetPay</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>

      <Dialog open={isAddEmployeeOpen} onOpenChange={setIsAddEmployeeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add new employee</DialogTitle>
            <DialogDescription>
              Capture the essentials. You can complete the onboarding workflow later from the staff directory.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleAddEmployee}>
            <div className="space-y-2">
              <Label htmlFor="employee-name">Full name</Label>
              <Input
                id="employee-name"
                placeholder="Jane Doe"
                value={newEmployee.name}
                onChange={(event) => setNewEmployee((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employee-role">Role</Label>
                <Input
                  id="employee-role"
                  placeholder="Role (e.g. Frontend Engineer)"
                  value={newEmployee.role}
                  onChange={(event) => setNewEmployee((prev) => ({ ...prev, role: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-team">Team</Label>
                <Input
                  id="employee-team"
                  placeholder="Team (e.g. Product, Finance)"
                  value={newEmployee.team}
                  onChange={(event) => setNewEmployee((prev) => ({ ...prev, team: event.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-id">Employee ID</Label>
              <Input id="employee-id" value={newEmployee.employeeId} readOnly className="font-mono text-sm" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-photo">Capture face (company ID card)</Label>
              <Input
                id="employee-photo"
                type="file"
                accept="image/*"
                capture="user"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    setNewEmployee((prev) => ({ ...prev, photo: file }));
                    setPhotoPreview(URL.createObjectURL(file));
                  } else {
                    setNewEmployee((prev) => ({ ...prev, photo: null }));
                    setPhotoPreview(null);
                  }
                }}
              />
              {photoPreview && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-2">Preview for ID card</p>
                  <img
                    src={photoPreview}
                    alt="Employee preview"
                    className="w-32 h-32 object-cover rounded-xl border border-border/30 shadow-sm"
                  />
                </div>
              )}
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employee-email">Email</Label>
                <Input
                  id="employee-email"
                  type="email"
                  placeholder="jane@netpay.ng"
                  value={newEmployee.email}
                  onChange={(event) => setNewEmployee((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-date">Start date</Label>
                <Input
                  id="employee-date"
                  type="date"
                  value={newEmployee.startDate}
                  onChange={(event) => setNewEmployee((prev) => ({ ...prev, startDate: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employee-address">Home address</Label>
                <Input
                  id="employee-address"
                  placeholder="Street, city"
                  value={newEmployee.address}
                  onChange={(event) =>
                    setNewEmployee((prev) => ({ ...prev, address: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-state">State</Label>
                <Input
                  id="employee-state"
                  placeholder="State of residence"
                  value={newEmployee.state}
                  onChange={(event) => setNewEmployee((prev) => ({ ...prev, state: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employee-salary">Salary band</Label>
                <Input
                  id="employee-salary"
                  placeholder="e.g. Band B"
                  value={newEmployee.salaryBand}
                  onChange={(event) => setNewEmployee((prev) => ({ ...prev, salaryBand: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-bank">Bank name</Label>
                <Input
                  id="employee-bank"
                  placeholder="Bank"
                  value={newEmployee.bankName}
                  onChange={(event) => setNewEmployee((prev) => ({ ...prev, bankName: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-account">Account number</Label>
                <Input
                  id="employee-account"
                  placeholder="0123456789"
                  value={newEmployee.bankAccount}
                  onChange={(event) => setNewEmployee((prev) => ({ ...prev, bankAccount: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-notes">Notes (optional)</Label>
              <Textarea
                id="employee-notes"
                placeholder="Onboarding checklist, equipment needs, salary band…"
                value={newEmployee.notes}
                onChange={(event) => setNewEmployee((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddEmployeeOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-brand text-white hover:bg-brand/90">
                Save & Continue
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isApplicantsOpen} onOpenChange={setIsApplicantsOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{selectedOpening?.title ?? "Applicants"}</DialogTitle>
            <DialogDescription>
              {selectedOpening
                ? `Viewing recent applicants for ${selectedOpening.title}.`
                : "Recent applicants"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {(
              selectedOpening ? applicantsByOpening[selectedOpening.title] || [] : []
            ).map((candidate) => (
              <div
                key={candidate.name}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-border/30 rounded-2xl bg-card/70 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{candidate.name}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {candidate.stage}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  Submitted: {candidate.submitted}
                </div>
              </div>
            ))}
            {selectedOpening &&
              (!applicantsByOpening[selectedOpening.title] ||
                applicantsByOpening[selectedOpening.title].length === 0) && (
                <p className="text-sm text-muted-foreground">No applicants yet.</p>
              )}
          </div>
          <div className="flex items-center justify-end">
            <Button variant="outline" onClick={() => setIsApplicantsOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isLetterOpen} onOpenChange={setIsLetterOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Appointment letter placeholders</DialogTitle>
            <DialogDescription>
              Replace the bracketed fields (e.g. [Candidate Name], [Salary]) before printing. You can duplicate this
              template for different teams or mouthpieces.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>Recommended fields you should update:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>[Candidate Name]</li>
              <li>[Position Title]</li>
              <li>[Start Date]</li>
              <li>[Location / Hybrid Arrangement]</li>
              <li>[Manager Name]</li>
              <li>[Team/Department]</li>
              <li>[Salary]</li>
              <li>[Band]</li>
              <li>[Acceptance Deadline]</li>
              <li>[Orientation Date]</li>
            </ul>
            <p>You can export the preview to PDF by choosing “Print” and saving as PDF in the print dialog.</p>
          </div>
          <div className="flex items-center justify-end">
            <Button variant="outline" onClick={() => setIsLetterOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

  <Dialog open={isEditEmployeeOpen} onOpenChange={setIsEditEmployeeOpen}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit employee</DialogTitle>
        <DialogDescription>Update role, team, contact details or start date.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={handleSaveEditedEmployee}>
        <div className="space-y-2">
          <Label htmlFor="edit-name">Full name</Label>
          <Input
            id="edit-name"
            value={newEmployee.name}
            onChange={(event) => setNewEmployee((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-role">Role</Label>
            <Input
              id="edit-role"
              value={newEmployee.role}
              onChange={(event) => setNewEmployee((prev) => ({ ...prev, role: event.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-team">Team</Label>
            <Input
              id="edit-team"
              value={newEmployee.team}
              onChange={(event) => setNewEmployee((prev) => ({ ...prev, team: event.target.value }))}
              required
            />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={newEmployee.email}
              onChange={(event) => setNewEmployee((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-date">Start date</Label>
            <Input
              id="edit-date"
              type="date"
              value={newEmployee.startDate}
              onChange={(event) => setNewEmployee((prev) => ({ ...prev, startDate: event.target.value }))}
            />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-address">Home address</Label>
            <Input
              id="edit-address"
              value={newEmployee.address}
              onChange={(event) => setNewEmployee((prev) => ({ ...prev, address: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-state">State</Label>
            <Input
              id="edit-state"
              value={newEmployee.state}
              onChange={(event) => setNewEmployee((prev) => ({ ...prev, state: event.target.value }))}
            />
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-salary">Salary band</Label>
            <Input
              id="edit-salary"
              value={newEmployee.salaryBand}
              onChange={(event) => setNewEmployee((prev) => ({ ...prev, salaryBand: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-bank">Bank name</Label>
            <Input
              id="edit-bank"
              value={newEmployee.bankName}
              onChange={(event) => setNewEmployee((prev) => ({ ...prev, bankName: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-account">Account number</Label>
            <Input
              id="edit-account"
              value={newEmployee.bankAccount}
              onChange={(event) => setNewEmployee((prev) => ({ ...prev, bankAccount: event.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-id">Employee ID</Label>
          <Input id="edit-id" value={newEmployee.employeeId} readOnly className="font-mono text-sm" />
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => setIsEditEmployeeOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" className="bg-brand text-white hover:bg-brand/90">
            Save changes
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
    </div>
  );
};

export default HrManager;


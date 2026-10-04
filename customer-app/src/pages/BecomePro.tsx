import { useState } from "react";
import { motion } from "framer-motion";
import { Briefcase, TrendingUp, Shield, BookOpen, ChevronRight, Loader2, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const benefits = [
  { icon: Briefcase, title: "Flexible Hours", desc: "Work when you want, as much as you want. Set your own schedule." },
  { icon: TrendingUp, title: "Guaranteed Payments", desc: "Get paid within 24 hours of job completion, straight to your bank." },
  { icon: Shield, title: "Free Insurance", desc: "Equipment & accident insurance included for all active pros on the platform." },
  { icon: BookOpen, title: "Training Support", desc: "Free skill upgradation workshops every month. Grow with HandyFix." },
];

const earningsTable = [
  { category: "Plumbing",        avgPerJob: 299,  jobsPerWeek: 8,  weeklyAvg: 2392 },
  { category: "Electrical",      avgPerJob: 349,  jobsPerWeek: 7,  weeklyAvg: 2443 },
  { category: "House Cleaning",  avgPerJob: 499,  jobsPerWeek: 10, weeklyAvg: 4990 },
  { category: "AC Service",      avgPerJob: 599,  jobsPerWeek: 6,  weeklyAvg: 3594 },
  { category: "Home Salon",      avgPerJob: 599,  jobsPerWeek: 9,  weeklyAvg: 5391 },
  { category: "Painting",        avgPerJob: 799,  jobsPerWeek: 4,  weeklyAvg: 3196 },
];

const serviceCategories = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "cleaning", label: "House Cleaning" },
  { value: "painting", label: "Painting" },
  { value: "ac-service", label: "AC Service" },
  { value: "carpentry", label: "Carpentry" },
  { value: "pest-control", label: "Pest Control" },
  { value: "appliance-repair", label: "Appliance Repair" },
  { value: "salon", label: "Home Salon" },
  { value: "hvac", label: "HVAC" },
];

const idProofTypes = [
  { value: "aadhar", label: "Aadhar Card" },
  { value: "pan", label: "PAN Card" },
  { value: "driving-license", label: "Driving License" },
  { value: "voter-id", label: "Voter ID" },
];

const proQuotes = [
  { name: "Rajesh Kumar", service: "Plumber", text: "I've doubled my income since joining HandyFix. Steady bookings, prompt payments, and great customer support.", initials: "RK" },
  { name: "Priya Nair", service: "Beauty Pro", text: "Working from home gave me flexibility. Now I serve 8–10 clients a day on my terms. HandyFix changed my life.", initials: "PN" },
  { name: "Deepak Singh", service: "AC Technician", text: "The training and tools support is amazing. I learned VRF servicing through HandyFix's workshops for free.", initials: "DS" },
];

const BecomePro = () => {
  const { toast } = useToast();
  const [jobsPerWeek, setJobsPerWeek] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", city: "", pincode: "",
    service_category: "plumbing", experience_years: "",
    has_tools: false, id_proof_type: "aadhar", about: "",
  });

  const set = (k: string, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  const estimatedEarnings = jobsPerWeek * 450;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.email || !form.phone || !form.city || !form.pincode) {
      toast({ title: "Missing required fields", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    if (form.about.trim().length < 50) {
      toast({ title: "Tell us more", description: "Please write at least 50 characters about your experience.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("pro_applications").insert({
      full_name: form.full_name,
      email: form.email,
      phone: form.phone,
      city: form.city,
      pincode: form.pincode,
      service_category: form.service_category,
      experience_years: parseInt(form.experience_years) || 0,
      has_tools: form.has_tools,
      id_proof_type: form.id_proof_type,
      about: form.about,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Something went wrong", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Application submitted! 🎉", description: "We'll review and contact you within 3 business days." });
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-20 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="container mx-auto grid md:grid-cols-2 gap-12 items-center">
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7 }}>
            <p className="text-sm font-semibold text-primary tracking-widest uppercase mb-4">Join 2,000+ Pros</p>
            <h1 className="text-4xl md:text-6xl font-extrabold text-foreground mb-6 leading-tight">
              Turn your skills into <span className="text-gradient-gold">daily income</span>
            </h1>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              HandyFix connects skilled professionals with thousands of customers who need their services. Flexible hours, guaranteed pay, and growing demand.
            </p>
            <Button className="bg-gradient-gold text-primary-foreground font-bold px-8 py-4 rounded-xl shadow-gold hover:opacity-90 text-lg"
              onClick={() => document.getElementById("apply-form")?.scrollIntoView({ behavior: "smooth" })}>
              Apply Now →
            </Button>
          </motion.div>

          {/* Earnings Calculator */}
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7 }}
            className="bg-card border border-border rounded-2xl p-8">
            <h3 className="text-lg font-bold text-foreground mb-2">💰 Earnings Calculator</h3>
            <p className="text-sm text-muted-foreground mb-6">How many jobs can you do per week?</p>
            <input type="range" min={2} max={20} value={jobsPerWeek}
              onChange={(e) => setJobsPerWeek(parseInt(e.target.value))}
              className="w-full accent-yellow-400 mb-4" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground text-sm">2 jobs/week</span>
              <span className="text-primary font-bold">{jobsPerWeek} jobs/week</span>
              <span className="text-muted-foreground text-sm">20 jobs/week</span>
            </div>
            <div className="mt-6 bg-primary/10 rounded-xl p-5 text-center border border-primary/20">
              <p className="text-sm text-muted-foreground mb-1">Estimated weekly earnings</p>
              <p className="text-4xl font-extrabold text-primary">₹{estimatedEarnings.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Based on ₹450 avg. per job</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20">
        <div className="container mx-auto">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-3xl md:text-4xl font-extrabold text-foreground mb-12 text-center">
            Why join HandyFix?
          </motion.h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((b, i) => (
              <motion.div key={b.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="bg-card border border-border rounded-2xl p-6 hover:border-primary/30 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <b.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-bold text-foreground mb-2">{b.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-card/50">
        <div className="container mx-auto">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-3xl font-extrabold text-foreground mb-12 text-center">
            3 steps to start earning
          </motion.h2>
          <div className="flex flex-col md:flex-row gap-6 items-center justify-center">
            {["Apply Online", "Get Verified", "Start Earning"].map((step, i) => (
              <div key={step} className="flex items-center gap-4">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-gold flex items-center justify-center text-2xl font-extrabold text-primary-foreground mx-auto mb-3 shadow-gold">
                    {i + 1}
                  </div>
                  <p className="font-bold text-foreground">{step}</p>
                </div>
                {i < 2 && <ChevronRight className="w-6 h-6 text-muted-foreground hidden md:block flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Earnings Table */}
      <section className="py-20">
        <div className="container mx-auto max-w-3xl">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-3xl font-extrabold text-foreground mb-8 text-center">
            Category Earnings Guide
          </motion.h2>
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left p-4 font-semibold text-foreground">Service</th>
                  <th className="text-right p-4 font-semibold text-foreground">Avg / Job</th>
                  <th className="text-right p-4 font-semibold text-foreground">Jobs/Week</th>
                  <th className="text-right p-4 font-semibold text-primary">Weekly Avg</th>
                </tr>
              </thead>
              <tbody>
                {earningsTable.map((row, i) => (
                  <tr key={row.category} className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${i % 2 === 0 ? "" : "bg-secondary/20"}`}>
                    <td className="p-4 font-medium text-foreground">{row.category}</td>
                    <td className="p-4 text-right text-muted-foreground">₹{row.avgPerJob}</td>
                    <td className="p-4 text-right text-muted-foreground">{row.jobsPerWeek}</td>
                    <td className="p-4 text-right font-bold text-primary">₹{row.weeklyAvg.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Testimonials from existing pros */}
      <section className="py-20 bg-card/50">
        <div className="container mx-auto">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-3xl font-extrabold text-foreground mb-10 text-center">
            What our pros say
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-6">
            {proQuotes.map((q, i) => (
              <motion.div key={q.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="bg-card border border-border rounded-2xl p-6">
                <p className="text-muted-foreground text-sm leading-relaxed mb-5 italic">"{q.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold">
                    {q.initials}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{q.name}</p>
                    <p className="text-xs text-muted-foreground">{q.service}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section className="py-20" id="apply-form">
        <div className="container mx-auto max-w-2xl">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl font-extrabold text-foreground mb-2 text-center">Apply to Join</h2>
            <p className="text-muted-foreground text-center mb-10">Takes 5 minutes. We respond in 3 business days.</p>

            {submitted ? (
              <div className="bg-card border border-primary/30 rounded-2xl p-12 text-center">
                <div className="text-5xl mb-4">🎉</div>
                <h3 className="text-2xl font-bold text-foreground mb-2">Application Submitted!</h3>
                <p className="text-muted-foreground">Our team will review your application and reach out within 3 business days. Keep an eye on your inbox.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-8 space-y-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground block mb-1">Full Name*</label>
                    <Input required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Rajesh Kumar" className="bg-secondary border-border" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground block mb-1">Email*</label>
                    <Input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@email.com" className="bg-secondary border-border" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground block mb-1">Phone*</label>
                    <Input required value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" className="bg-secondary border-border" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground block mb-1">City*</label>
                    <Input required value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Ahmedabad" className="bg-secondary border-border" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground block mb-1">Pincode*</label>
                    <Input required value={form.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/, "").slice(0, 6))} placeholder="380001" className="bg-secondary border-border" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground block mb-1">Years of Experience*</label>
                    <Input required type="number" min={0} max={50} value={form.experience_years} onChange={(e) => set("experience_years", e.target.value)} placeholder="5" className="bg-secondary border-border" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground block mb-1">Service Category*</label>
                    <select value={form.service_category} onChange={(e) => set("service_category", e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-border bg-secondary text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                      {serviceCategories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground block mb-1">ID Proof Type*</label>
                    <select value={form.id_proof_type} onChange={(e) => set("id_proof_type", e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-border bg-secondary text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                      {idProofTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="has-tools" checked={form.has_tools} onChange={(e) => set("has_tools", e.target.checked)}
                    className="w-4 h-4 accent-yellow-400 rounded" />
                  <label htmlFor="has-tools" className="text-sm text-foreground cursor-pointer">I have my own tools and equipment</label>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">About Your Experience* (min. 50 chars)</label>
                  <Textarea required value={form.about} onChange={(e) => set("about", e.target.value)}
                    placeholder="Tell us about your skills, certifications, and why you want to join HandyFix..."
                    rows={4} className="bg-secondary border-border resize-none" />
                  <p className="text-xs text-muted-foreground mt-1 text-right">{form.about.length} / 50 min</p>
                </div>
                <Button type="submit" disabled={submitting}
                  className="w-full bg-gradient-gold text-primary-foreground font-bold py-4 rounded-xl shadow-gold hover:opacity-90 text-base">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Submitting...</> : "Submit Application →"}
                </Button>
              </form>
            )}
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default BecomePro;

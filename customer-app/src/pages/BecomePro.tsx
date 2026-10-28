import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

const BecomePro = () => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", city: "", pincode: "",
    service_category: "plumbing", experience_years: "",
    has_tools: false, id_proof_type: "aadhar", about: "",
  });

  const set = (k: string, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

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
    toast({ title: "Application submitted! 🎉", description: "We'll contact you after your application is reviewed." });
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="bg-gradient-to-b from-primary/5 to-transparent px-4 pt-32 pb-20 sm:px-6">
        <div className="container mx-auto w-full max-w-5xl">
          <motion.div className="mx-auto w-full max-w-3xl text-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <p className="text-sm font-semibold text-primary tracking-widest uppercase mb-4">Provider Sign-Up</p>
            <h1 className="text-4xl md:text-6xl font-extrabold text-foreground mb-6 leading-tight text-balance">
              Turn your skills into <span className="text-gradient-gold">daily income</span>
            </h1>
            <p className="mx-auto max-w-2xl text-muted-foreground text-lg mb-8 leading-relaxed">
              Submit a provider application to offer your services through HandyFix.
            </p>
            <Button className="bg-gradient-gold text-primary-foreground font-bold px-8 py-4 rounded-xl shadow-gold hover:opacity-90 text-lg"
              onClick={() => document.getElementById("apply-form")?.scrollIntoView({ behavior: "smooth" })}>
              Apply Now →
            </Button>
          </motion.div>

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

      {/* Application Form */}
      <section className="px-4 py-16 sm:px-6 sm:py-20" id="apply-form">
        <div className="container mx-auto w-full max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl font-extrabold text-foreground mb-2 text-center">Apply to Join</h2>
            <p className="text-muted-foreground text-center mb-10">Submit your information for review.</p>

            {submitted ? (
              <div className="bg-card border border-primary/30 rounded-2xl p-8 sm:p-12 text-center shadow-sm">
                <div className="text-5xl mb-4">🎉</div>
                <h3 className="text-2xl font-bold text-foreground mb-2">Application Submitted!</h3>
                <p className="text-muted-foreground">Your application has been received for review.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-5 sm:p-8 space-y-5 shadow-sm">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="provider-full-name" className="text-sm font-medium text-foreground block mb-2">Full Name*</label>
                    <Input id="provider-full-name" required autoComplete="name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Your full name" className="h-12 rounded-xl border-input bg-background transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/30" />
                  </div>
                  <div>
                    <label htmlFor="provider-email" className="text-sm font-medium text-foreground block mb-2">Email*</label>
                    <Input id="provider-email" required type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@email.com" className="h-12 rounded-xl border-input bg-background transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/30" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="provider-phone" className="text-sm font-medium text-foreground block mb-2">Phone*</label>
                    <Input id="provider-phone" required type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" className="h-12 rounded-xl border-input bg-background transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/30" />
                  </div>
                  <div>
                    <label htmlFor="provider-city" className="text-sm font-medium text-foreground block mb-2">City*</label>
                    <Input id="provider-city" required autoComplete="address-level2" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Ahmedabad" className="h-12 rounded-xl border-input bg-background transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/30" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="provider-pincode" className="text-sm font-medium text-foreground block mb-2">Pincode*</label>
                    <Input id="provider-pincode" required inputMode="numeric" autoComplete="postal-code" value={form.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/, "").slice(0, 6))} placeholder="380001" className="h-12 rounded-xl border-input bg-background transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/30" />
                  </div>
                  <div>
                    <label htmlFor="provider-experience" className="text-sm font-medium text-foreground block mb-2">Years of Experience*</label>
                    <Input id="provider-experience" required type="number" min={0} max={50} value={form.experience_years} onChange={(e) => set("experience_years", e.target.value)} placeholder="5" className="h-12 rounded-xl border-input bg-background transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/30" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="provider-service-category" className="text-sm font-medium text-foreground block mb-2">Service Category*</label>
                    <select value={form.service_category} onChange={(e) => set("service_category", e.target.value)}
                      id="provider-service-category"
                      className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                      {serviceCategories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="provider-id-proof" className="text-sm font-medium text-foreground block mb-2">ID Proof Type*</label>
                    <select id="provider-id-proof" value={form.id_proof_type} onChange={(e) => set("id_proof_type", e.target.value)}
                      className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                      {idProofTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-4">
                  <input type="checkbox" id="has-tools" checked={form.has_tools} onChange={(e) => set("has_tools", e.target.checked)}
                    className="h-4 w-4 rounded accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                  <label htmlFor="has-tools" className="text-sm text-foreground cursor-pointer">I have my own tools and equipment</label>
                </div>
                <div>
                  <label htmlFor="provider-about" className="text-sm font-medium text-foreground block mb-2">About Your Experience* (min. 50 chars)</label>
                  <Textarea required value={form.about} onChange={(e) => set("about", e.target.value)}
                    id="provider-about"
                    placeholder="Tell us about your skills, certifications, and why you want to join HandyFix..."
                    rows={5} className="min-h-32 rounded-xl border-input bg-background transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/30 resize-y" />
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

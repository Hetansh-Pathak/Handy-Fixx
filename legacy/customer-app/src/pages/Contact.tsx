import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Phone, MessageCircle, ChevronDown, ChevronUp, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";

const faqs = [
  { q: "How do I cancel a booking?", a: "Go to My Bookings and click the Cancel button next to your upcoming booking. Cancellations must be made at least 2 hours before the scheduled time for a full refund." },
  { q: "What if the professional is late?", a: "If your pro is more than 30 minutes late, you'll receive a ₹100 HandyFix credit automatically. Contact us if you'd like to reschedule." },
  { q: "Is there a service warranty?", a: "Yes! All completed services come with a 7-day service warranty. If you're not satisfied, we'll re-do the job at no additional cost." },
  { q: "How do I pay?", a: "Payment is collected after service completion. We accept UPI, credit/debit cards, net banking, and cash on delivery." },
  { q: "Can I reschedule a booking?", a: "Yes, you can reschedule up to 4 hours before your booking slot from the My Bookings page. Rescheduling is free." },
  { q: "How are professionals verified?", a: "All pros undergo background verification, skill assessment by our team, and a supervised trial job before being listed on HandyFix." },
  { q: "What areas do you serve?", a: "We currently serve 15+ cities across India, including Ahmedabad, Mumbai, Delhi, Bangalore, and more. Enter your pincode to check availability." },
  { q: "How do I become a professional?", a: "Visit our Become a Pro page and fill out the application form. We'll review your application and contact you within 3 business days." },
];

const contactCards = [
  { icon: Mail, title: "Email Us", desc: "support@handyfix.in", sub: "We reply within 24 hours" },
  { icon: Phone, title: "Call Us", desc: "+91 98765 43210", sub: "Mon–Sat, 8 AM – 8 PM" },
  { icon: MessageCircle, title: "Live Chat", desc: "Chat with us now", sub: "Average wait: 2 mins" },
];

const subjects = [
  { value: "booking-issue", label: "Booking Issue" },
  { value: "payment", label: "Payment Query" },
  { value: "provider-complaint", label: "Provider Complaint" },
  { value: "feedback", label: "Feedback / Suggestion" },
  { value: "other", label: "Other" },
];

const Contact = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useApp();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: profile?.full_name || "",
    email: user?.email || "",
    phone: profile?.phone || "",
    subject: "booking-issue",
    message: "",
  });

  const handleChange = (field: string, val: string) =>
    setForm((prev) => ({ ...prev, [field]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.message.trim().length < 20) {
      toast({ title: "Message too short", description: "Please describe your issue in at least 20 characters.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("contact_messages").insert({
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      subject: form.subject,
      message: form.message,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Something went wrong", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Message sent! 📩", description: "We'll get back to you within 24 hours." });
    setForm((prev) => ({ ...prev, message: "", phone: "" }));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 pb-16 container mx-auto px-4">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <p className="text-sm font-semibold text-primary tracking-widest uppercase mb-3">Get in Touch</p>
          <h1 className="text-4xl md:text-5xl font-extrabold text-foreground mb-4">We're here to help</h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Have a question or issue? Reach out and our team will respond promptly.
          </p>
        </motion.div>

        {/* Contact Cards */}
        <div className="grid md:grid-cols-3 gap-5 mb-16">
          {contactCards.map((card, i) => (
            <motion.div key={card.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-card border border-border rounded-2xl p-6 text-center hover:border-primary/40 transition-colors cursor-default">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <card.icon className="w-7 h-7 text-primary" />
              </div>
              <p className="font-bold text-foreground mb-1">{card.title}</p>
              <p className="text-primary font-medium text-sm">{card.desc}</p>
              <p className="text-muted-foreground text-xs mt-1">{card.sub}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Form */}
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <h2 className="text-2xl font-bold text-foreground mb-6">Send us a message</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">Your Name*</label>
                  <Input required value={form.name} onChange={(e) => handleChange("name", e.target.value)}
                    placeholder="Rahul Sharma" className="bg-secondary border-border" />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">Email*</label>
                  <Input required type="email" value={form.email} onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="you@email.com" className="bg-secondary border-border" />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">Phone (optional)</label>
                  <Input value={form.phone} onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="+91 98765 43210" className="bg-secondary border-border" />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">Subject*</label>
                  <select required value={form.subject} onChange={(e) => handleChange("subject", e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-border bg-secondary text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                    {subjects.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Message* (min. 20 chars)</label>
                <Textarea required value={form.message} onChange={(e) => handleChange("message", e.target.value)}
                  placeholder="Describe your issue or question in detail..."
                  rows={5} className="bg-secondary border-border resize-none" />
                <p className="text-xs text-muted-foreground mt-1 text-right">{form.message.length} chars</p>
              </div>
              <Button type="submit" disabled={submitting}
                className="w-full bg-gradient-gold text-primary-foreground font-bold py-3 rounded-xl shadow-gold hover:opacity-90">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                {submitting ? "Sending..." : "Send Message"}
              </Button>
            </form>
          </motion.div>

          {/* FAQ */}
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <h2 className="text-2xl font-bold text-foreground mb-6">Frequently Asked Questions</h2>
            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/50 transition-colors">
                    <span className="font-medium text-foreground text-sm pr-4">{faq.q}</span>
                    {openFaq === i
                      ? <ChevronUp className="w-4 h-4 text-primary flex-shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  </button>
                  {openFaq === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                      {faq.a}
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Contact;

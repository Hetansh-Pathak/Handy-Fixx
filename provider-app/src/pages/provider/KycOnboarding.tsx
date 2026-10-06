import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Calendar, CreditCard, Camera, FileText, MapPin, Briefcase,
  Award, CheckCircle2, ChevronRight, ChevronLeft, Upload, Loader2,
  AlertCircle, ShieldCheck, Eye, Trash2, RefreshCw
} from 'lucide-react';
import {
  GUJARAT_CITIES, SERVICE_ICONS, KYC_TOTAL_STEPS, KYC_STEP_LABELS, TERMS_VERSION,
  validateAadhaar, validatePAN, maskAadhaar, maskPAN, compressImage,
  validateKycFile
} from '@/lib/constants';
import TermsAndConditions from './TermsAndConditions';

interface ServiceOption {
  id: string;
  name: string;
  icon: string | null;
}

const KycOnboarding: React.FC = () => {
  const { provider, refreshProvider } = useProvider();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [servicesList, setServicesList] = useState<ServiceOption[]>([]);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  
  // Aadhaar
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [existingAadhaarLast4, setExistingAadhaarLast4] = useState<string | null>(null);
  const [aadhaarFrontFile, setAadhaarFrontFile] = useState<File | null>(null);
  const [aadhaarBackFile, setAadhaarBackFile] = useState<File | null>(null);
  const [aadhaarFrontPath, setAadhaarFrontPath] = useState('');
  const [aadhaarBackPath, setAadhaarBackPath] = useState('');
  
  // Selfie
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePath, setSelfiePath] = useState('');
  const [isCapturingSelfie, setIsCapturingSelfie] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // PAN
  const [panNumber, setPanNumber] = useState('');
  const [panFile, setPanFile] = useState<File | null>(null);
  const [panPath, setPanPath] = useState('');

  // Cities & Professions
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [experienceYears, setExperienceYears] = useState<number>(2);

  // Extras
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificatePath, setCertificatePath] = useState('');
  const [bio, setBio] = useState('');

  // Terms & Consent
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Upload Progress Tracking
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  // Fetch Available Services from DB
  useEffect(() => {
    supabase.from('services').select('id, name, icon').then(({ data }) => {
      if (data) setServicesList(data);
    });
  }, []);

  // Pre-fill existing data from provider and provider_kyc
  const loadExistingData = useCallback(async () => {
    if (!provider) return;

    if (provider.first_name) setFirstName(provider.first_name);
    if (provider.last_name) setLastName(provider.last_name);
    if (provider.date_of_birth) setDob(provider.date_of_birth);
    if (provider.pincodes) setSelectedCities(provider.pincodes);
    if (provider.service_ids) setSelectedServices(provider.service_ids);
    if (provider.experience_years) setExperienceYears(provider.experience_years);
    if (provider.bio) setBio(provider.bio);
    if (provider.onboarding_step && provider.onboarding_step > 0 && provider.onboarding_step <= KYC_TOTAL_STEPS) {
      setStep(provider.onboarding_step);
    }

    // Split full_name if first/last not separate
    if (!provider.first_name && provider.full_name) {
      const parts = provider.full_name.trim().split(' ');
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
    }

    // Fetch existing KYC row. aadhaar_hash is deliberately not selected — the client
    // has no legitimate use for it now that hashing happens server-side, and there's
    // no reason to put a sensitive value in browser memory that doesn't need to be there.
    const { data: kycRow } = await supabase
      .from('provider_kyc')
      .select('aadhaar_last4, pan_number, aadhaar_front_path, aadhaar_back_path, selfie_path, pan_path, certificate_path, consent_accepted_at, terms_version')
      .eq('provider_id', provider.id)
      .maybeSingle();

    if (kycRow) {
      if (kycRow.aadhaar_last4) setExistingAadhaarLast4(kycRow.aadhaar_last4);
      if (kycRow.pan_number) setPanNumber(kycRow.pan_number);
      if (kycRow.aadhaar_front_path) setAadhaarFrontPath(kycRow.aadhaar_front_path);
      if (kycRow.aadhaar_back_path) setAadhaarBackPath(kycRow.aadhaar_back_path);
      if (kycRow.selfie_path) setSelfiePath(kycRow.selfie_path);
      if (kycRow.pan_path) setPanPath(kycRow.pan_path);
      if (kycRow.certificate_path) setCertificatePath(kycRow.certificate_path);
      if (kycRow.consent_accepted_at) setTermsAccepted(true);
    }
  }, [provider]);

  useEffect(() => { loadExistingData(); }, [loadExistingData]);

  // Upload helper to private provider-kyc bucket
  const uploadFileToBucket = async (file: File, key: string): Promise<string> => {
    if (!provider) throw new Error('Not logged in');
    
    // Validate file
    const err = validateKycFile(file);
    if (err) throw new Error(err);

    // Compress image if applicable
    setUploadProgress(prev => ({ ...prev, [key]: 20 }));
    const compressed = await compressImage(file);
    setUploadProgress(prev => ({ ...prev, [key]: 50 }));

    const ext = compressed.name.split('.').pop() || 'jpg';
    const filePath = `${provider.user_id}/${key}_${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('provider-kyc')
      .upload(filePath, compressed, { upsert: true });

    if (uploadErr) throw uploadErr;
    setUploadProgress(prev => ({ ...prev, [key]: 100 }));
    return filePath;
  };

  // Camera Selfie capture
  const startCamera = async () => {
    try {
      setIsCapturingSelfie(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      toast({ title: 'Camera Access Denied', description: 'Please allow camera access or upload a photo manually.', variant: 'destructive' });
      setIsCapturingSelfie(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(blob => {
      if (blob) {
        const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
        setSelfieFile(file);
        stopCamera();
      }
    }, 'image/jpeg', 0.9);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCapturingSelfie(false);
  };

  useEffect(() => {
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, []);

  // Save Step Data to Database (Autosave on Next)
  const saveStepData = async (nextStep: number) => {
    if (!provider) return false;
    setSaving(true);
    try {
      const full_name = `${firstName.trim()} ${lastName.trim()}`.trim();

      // Dynamically construct update payload
      const spUpdate: Record<string, any> = {
        full_name: full_name || provider.full_name,
      };
      if (firstName.trim()) spUpdate.first_name = firstName.trim();
      if (lastName.trim()) spUpdate.last_name = lastName.trim();
      if (dob) spUpdate.date_of_birth = dob;
      if (selectedCities.length > 0) spUpdate.pincodes = selectedCities;
      if (selectedServices.length > 0) spUpdate.service_ids = selectedServices;
      if (experienceYears !== undefined) spUpdate.experience_years = experienceYears;
      if (bio.trim()) spUpdate.bio = bio.trim();
      spUpdate.onboarding_step = nextStep;

      // Update service_providers draft fields
      const { error: spErr } = await supabase
        .from('service_providers')
        .update(spUpdate)
        .eq('id', provider.id);

      if (spErr) {
        if (spErr.message.includes('schema cache') || spErr.message.includes('column')) {
          toast({
            title: '⚠️ Database Migration Required',
            description: 'Please run database/migrations/provider/20261005000000_kyc_onboarding.sql in your Supabase SQL Editor.',
            variant: 'destructive',
          });
          setSaving(false);
          return false;
        }
        throw spErr;
      }

      // Handle File Uploads if new files selected
      let fPath = aadhaarFrontPath;
      let bPath = aadhaarBackPath;
      let sPath = selfiePath;
      let pPath = panPath;
      let cPath = certificatePath;

      if (aadhaarFrontFile) {
        fPath = await uploadFileToBucket(aadhaarFrontFile, 'aadhaar_front');
        setAadhaarFrontPath(fPath);
        setAadhaarFrontFile(null);
      }
      if (aadhaarBackFile) {
        bPath = await uploadFileToBucket(aadhaarBackFile, 'aadhaar_back');
        setAadhaarBackPath(bPath);
        setAadhaarBackFile(null);
      }
      if (selfieFile) {
        sPath = await uploadFileToBucket(selfieFile, 'selfie');
        setSelfiePath(sPath);
        setSelfieFile(null);
      }
      if (panFile) {
        pPath = await uploadFileToBucket(panFile, 'pan');
        setPanPath(pPath);
        setPanFile(null);
      }
      if (certificateFile) {
        cPath = await uploadFileToBucket(certificateFile, 'certificate');
        setCertificatePath(cPath);
        setCertificateFile(null);
      }

      // Upsert provider_kyc draft row. The Aadhaar number itself is NOT sent here:
      // it is hashed server-side by submit_aadhaar_kyc() below, keyed by a secret
      // that never reaches the browser. aadhaar_last4/aadhaar_hash are therefore
      // left out of this payload entirely so this upsert can't blank them out —
      // Supabase's upsert only overwrites the columns you include on conflict.
      const { error: kycErr } = await supabase
        .from('provider_kyc')
        .upsert({
          provider_id: provider.id,
          pan_number: panNumber ? panNumber.toUpperCase() : null,
          aadhaar_front_path: fPath || null,
          aadhaar_back_path: bPath || null,
          selfie_path: sPath || null,
          pan_path: pPath || null,
          certificate_path: cPath || null,
          terms_version: TERMS_VERSION,
          consent_accepted_at: termsAccepted ? new Date().toISOString() : null,
        });

      if (kycErr) {
        if (kycErr.message.includes('relation') || kycErr.message.includes('table') || kycErr.message.includes('schema cache')) {
          toast({
            title: '⚠️ Database Migration Required',
            description: 'Please run database/migrations/provider/20261005000000_kyc_onboarding.sql in your Supabase SQL Editor.',
            variant: 'destructive',
          });
          setSaving(false);
          return false;
        }
        throw kycErr;
      }

      // Submit the Aadhaar number (if a new, valid one was typed) to the server-side
      // hashing RPC. Only sent when changed — re-submitting an unchanged number is
      // harmless but needless network/DB work on every autosave.
      if (aadhaarNumber && validateAadhaar(aadhaarNumber)) {
        const { data: aadhaarRes, error: aadhaarErr } = await (supabase as any).rpc('submit_aadhaar_kyc', { p_aadhaar: aadhaarNumber });
        if (aadhaarErr) {
          toast({ title: 'Save Failed', description: aadhaarErr.message, variant: 'destructive' });
          setSaving(false);
          return false;
        }
        const aRes = aadhaarRes as { ok: boolean; reason?: string; last4?: string } | null;
        if (!aRes?.ok) {
          const aadhaarWhy: Record<string, string> = {
            invalid_format: 'Enter a valid 12-digit Aadhaar number.',
            not_a_provider: 'Your provider profile could not be found. Please sign in again.',
            unauthorized: 'Please sign in again.',
            duplicate_aadhaar: 'This Aadhaar number is already registered to another account.',
            not_configured: 'Aadhaar verification is temporarily unavailable. Please try again shortly or contact support.',
          };
          toast({
            title: 'Aadhaar Not Saved',
            description: (aRes?.reason && aadhaarWhy[aRes.reason]) || 'Please check the number and try again.',
            variant: 'destructive',
          });
          setSaving(false);
          return false;
        }
        setExistingAadhaarLast4(aRes.last4 ?? null);
      }

      await refreshProvider();
      setSaving(false);
      return true;
    } catch (error: any) {
      setSaving(false);
      toast({ title: 'Save Failed', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  // Step Validation Functions
  const validateStep = (): boolean => {
    if (step === 1) {
      if (!firstName.trim() || !lastName.trim()) {
        toast({ title: 'Name Required', description: 'Please enter both first and last name matching your ID.', variant: 'destructive' });
        return false;
      }
    } else if (step === 2) {
      if (!dob) {
        toast({ title: 'Date of Birth Required', description: 'Please select your date of birth.', variant: 'destructive' });
        return false;
      }
      const birthDate = new Date(dob);
      const ageDate = new Date(Date.now() - birthDate.getTime());
      const age = Math.abs(ageDate.getUTCFullYear() - 1970);
      if (age < 18) {
        toast({ title: 'Age Limit Warning ⚠️', description: 'You must be at least 18 years old to register as a service provider.', variant: 'destructive' });
        return false;
      }
    } else if (step === 3) {
      if (!aadhaarNumber && !aadhaarFrontPath) {
        toast({ title: 'Aadhaar Details Required', description: 'Please enter your 12-digit Aadhaar number and upload documents.', variant: 'destructive' });
        return false;
      }
      if (aadhaarNumber && !validateAadhaar(aadhaarNumber)) {
        toast({ title: 'Invalid Aadhaar Number ❌', description: 'The 12-digit Aadhaar number checksum is invalid. Check for typos.', variant: 'destructive' });
        return false;
      }
      if (!aadhaarFrontPath && !aadhaarFrontFile) {
        toast({ title: 'Aadhaar Front Upload Required', description: 'Please upload the front image/PDF of your Aadhaar card.', variant: 'destructive' });
        return false;
      }
    } else if (step === 4) {
      if (!selfiePath && !selfieFile) {
        toast({ title: 'Selfie Required', description: 'Please take or upload a clear photo of your face.', variant: 'destructive' });
        return false;
      }
    } else if (step === 5) {
      if (!panNumber) {
        toast({ title: 'PAN Number Required', description: 'Please enter your 10-character PAN number.', variant: 'destructive' });
        return false;
      }
      if (!validatePAN(panNumber.toUpperCase())) {
        toast({ title: 'Invalid PAN Format ❌', description: 'PAN must be in format ABCDE1234F (5 letters, 4 numbers, 1 letter).', variant: 'destructive' });
        return false;
      }
      if (!panPath && !panFile) {
        toast({ title: 'PAN Card Upload Required', description: 'Please upload an image/PDF of your PAN card.', variant: 'destructive' });
        return false;
      }
    } else if (step === 6) {
      if (selectedCities.length === 0) {
        toast({ title: 'Select Working Cities', description: 'Select at least 1 city where you can provide services.', variant: 'destructive' });
        return false;
      }
    } else if (step === 7) {
      if (selectedServices.length === 0) {
        toast({ title: 'Select Profession', description: 'Select at least 1 service profession.', variant: 'destructive' });
        return false;
      }
    } else if (step === 9) {
      if (!termsAccepted) {
        toast({ title: 'Consent Required', description: 'You must accept the partner agreement terms to submit.', variant: 'destructive' });
        return false;
      }
    }
    return true;
  };

  const handleNext = async () => {
    if (!validateStep()) return;
    if (step < KYC_TOTAL_STEPS) {
      const ok = await saveStepData(step + 1);
      if (ok) setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // Final Submit
  const handleSubmitKyc = async () => {
    if (!validateStep()) return;
    setSaving(true);
    try {
      const ok = await saveStepData(KYC_TOTAL_STEPS);
      if (!ok) return;

      const { data, error } = await supabase.rpc('submit_kyc');
      if (error) throw error;

      const res = data as any;
      if (res && res.success === false) {
        throw new Error(res.error || res.message || 'Verification submission failed');
      }

      await refreshProvider();
      setSubmittedSuccess(true);
      toast({
        title: 'KYC Submitted Successfully! 🎉',
        description: 'Our admin team will review your verification within 1–2 working days.',
      });
    } catch (err: any) {
      toast({ title: 'Submission Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (submittedSuccess || provider?.kyc_status === 'pending') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Card className="glass-card p-8 text-center max-w-md mx-auto space-y-6">
            <div className="w-20 h-20 rounded-full bg-success/20 text-success flex items-center justify-center mx-auto">
              <ShieldCheck className="h-10 w-10 animate-bounce" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Application Under Review</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Thank you for submitting your KYC verification details. Our team is currently reviewing your documents. You will receive an alert as soon as your profile is verified!
            </p>
            <div className="p-3 bg-secondary/50 rounded-xl text-xs text-muted-foreground space-y-1">
              <p>⏱️ Average review time: <strong>1–2 business days</strong></p>
              <p>📱 You can explore your profile while you wait.</p>
            </div>
            <Button
              className="w-full gold-gradient text-primary-foreground font-semibold"
              onClick={() => navigate('/provider-panel')}
            >
              Go to Provider Panel
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (provider?.kyc_status === 'approved') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Card className="glass-card p-8 text-center max-w-md mx-auto space-y-6">
            <div className="w-20 h-20 rounded-full bg-success/20 text-success flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Account Verified 🎉</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your identity verification is complete and your provider account is fully active. You can now accept customer bookings and go online anytime!
            </p>
            <Button
              className="w-full gold-gradient text-primary-foreground font-semibold"
              onClick={() => navigate('/provider-panel')}
            >
              Go to Dashboard
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  const progressPercent = Math.round((step / KYC_TOTAL_STEPS) * 100);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* Header & Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Identity Verification</h1>
            <p className="text-xs text-muted-foreground">Step {step} of {KYC_TOTAL_STEPS} — {KYC_STEP_LABELS[step]}</p>
          </div>
          <Badge variant="outline" className="text-xs font-semibold border-primary/30 text-primary">
            {progressPercent}% Complete
          </Badge>
        </div>
        <Progress value={progressPercent} className="h-2 bg-secondary" />
      </div>

      {/* Rejection Alert Header if re-submitting */}
      {provider?.kyc_status === 'rejected' && (
        <Card className="p-4 bg-destructive/10 border-destructive/30 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs text-destructive space-y-1">
            <p className="font-bold text-sm">Previous Application Rejected</p>
            <p>{provider.kyc_rejection_reason || 'Please correct the information and re-upload clear documents.'}</p>
          </div>
        </Card>
      )}

      {/* Main Wizard Form Card */}
      <Card className="glass-card p-6 md:p-8 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* STEP 1: Name */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary"><User className="h-6 w-6" /></div>
                  <div>
                    <h2 className="text-lg font-bold">What is your full legal name?</h2>
                    <p className="text-xs text-muted-foreground">Must match the name on your Government ID card exactly.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      placeholder="e.g. Ramesh"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      className="glass-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      placeholder="e.g. Patel"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      className="glass-input"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: DOB */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary"><Calendar className="h-6 w-6" /></div>
                  <div>
                    <h2 className="text-lg font-bold">When were you born?</h2>
                    <p className="text-xs text-muted-foreground">You must be 18 years or older to work on HandyFix.</p>
                  </div>
                </div>
                <div className="space-y-2 pt-2">
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={dob}
                    onChange={e => setDob(e.target.value)}
                    className="glass-input"
                  />
                </div>
              </div>
            )}

            {/* STEP 3: Aadhaar */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary"><CreditCard className="h-6 w-6" /></div>
                  <div>
                    <h2 className="text-lg font-bold">Aadhaar Card Verification</h2>
                    <p className="text-xs text-muted-foreground">We encrypt your Aadhaar data and only store last 4 digits & SHA-256 hash.</p>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <Label htmlFor="aadhaar">12-Digit Aadhaar Number</Label>
                  <Input
                    id="aadhaar"
                    placeholder="1234 5678 9012"
                    maxLength={12}
                    value={aadhaarNumber}
                    onChange={e => setAadhaarNumber(e.target.value.replace(/\D/g, ''))}
                    className="glass-input tracking-widest font-mono"
                  />
                  {aadhaarNumber.length === 12 && (
                    <p className={`text-xs ${validateAadhaar(aadhaarNumber) ? 'text-success' : 'text-destructive'}`}>
                      {validateAadhaar(aadhaarNumber) ? '✓ Valid Aadhaar Checksum' : '❌ Invalid Aadhaar Checksum'}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label>Aadhaar Front Image / PDF</Label>
                    <div className="border-2 border-dashed border-border rounded-xl p-4 text-center space-y-2 hover:border-primary/50 transition-colors">
                      {aadhaarFrontPath || aadhaarFrontFile ? (
                        <div className="flex items-center justify-between text-xs text-success">
                          <span className="truncate max-w-[150px]">{aadhaarFrontFile ? aadhaarFrontFile.name : '✓ Front Uploaded'}</span>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => { setAadhaarFrontFile(null); setAadhaarFrontPath(''); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label className="cursor-pointer block space-y-1">
                          <Upload className="h-6 w-6 text-muted-foreground mx-auto" />
                          <span className="text-xs font-semibold text-primary block">Upload Front</span>
                          <span className="text-[10px] text-muted-foreground block">Max 5MB (JPG, PNG, PDF)</span>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={e => { if (e.target.files?.[0]) setAadhaarFrontFile(e.target.files[0]); }}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Aadhaar Back Image / PDF</Label>
                    <div className="border-2 border-dashed border-border rounded-xl p-4 text-center space-y-2 hover:border-primary/50 transition-colors">
                      {aadhaarBackPath || aadhaarBackFile ? (
                        <div className="flex items-center justify-between text-xs text-success">
                          <span className="truncate max-w-[150px]">{aadhaarBackFile ? aadhaarBackFile.name : '✓ Back Uploaded'}</span>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => { setAadhaarBackFile(null); setAadhaarBackPath(''); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label className="cursor-pointer block space-y-1">
                          <Upload className="h-6 w-6 text-muted-foreground mx-auto" />
                          <span className="text-xs font-semibold text-primary block">Upload Back</span>
                          <span className="text-[10px] text-muted-foreground block">Max 5MB (JPG, PNG, PDF)</span>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={e => { if (e.target.files?.[0]) setAadhaarBackFile(e.target.files[0]); }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Selfie */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary"><Camera className="h-6 w-6" /></div>
                  <div>
                    <h2 className="text-lg font-bold">Profile Selfie Photo</h2>
                    <p className="text-xs text-muted-foreground">Take or upload a clear, front-facing portrait photo of your face.</p>
                  </div>
                </div>

                {isCapturingSelfie ? (
                  <div className="space-y-3 text-center">
                    <video ref={videoRef} className="w-full max-w-sm h-64 rounded-2xl bg-black mx-auto object-cover border border-primary" autoPlay playsInline />
                    <div className="flex justify-center gap-3">
                      <Button onClick={capturePhoto} className="gold-gradient text-primary-foreground font-semibold">
                        <Camera className="h-4 w-4 mr-2" /> Snap Photo
                      </Button>
                      <Button variant="outline" onClick={stopCamera}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 pt-2">
                    {selfiePath || selfieFile ? (
                      <div className="text-center space-y-2">
                        <div className="w-32 h-32 rounded-full overflow-hidden mx-auto border-2 border-primary bg-secondary flex items-center justify-center">
                          {selfieFile ? (
                            <img src={URL.createObjectURL(selfieFile)} alt="Selfie preview" className="w-full h-full object-cover" />
                          ) : (
                            <CheckCircle2 className="h-12 w-12 text-success" />
                          )}
                        </div>
                        <p className="text-xs text-success font-medium">✓ Selfie captured</p>
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => { setSelfieFile(null); setSelfiePath(''); }}>
                          <RefreshCw className="h-3 w-3 mr-1" /> Retake Photo
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Button
                          variant="outline"
                          className="h-28 flex-col gap-2 border-dashed border-2 hover:border-primary"
                          onClick={startCamera}
                        >
                          <Camera className="h-6 w-6 text-primary" />
                          <span>Use Live Camera</span>
                        </Button>

                        <label className="h-28 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary transition-colors">
                          <Upload className="h-6 w-6 text-muted-foreground" />
                          <span className="text-xs font-semibold text-foreground">Upload Portrait Photo</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="user"
                            className="hidden"
                            onChange={e => { if (e.target.files?.[0]) setSelfieFile(e.target.files[0]); }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* STEP 5: PAN */}
            {step === 5 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary"><FileText className="h-6 w-6" /></div>
                  <div>
                    <h2 className="text-lg font-bold">PAN Card Verification</h2>
                    <p className="text-xs text-muted-foreground">Required for tax compliance and payout processing.</p>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <Label htmlFor="pan">PAN Card Number</Label>
                  <Input
                    id="pan"
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    value={panNumber}
                    onChange={e => setPanNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    className="glass-input tracking-widest font-mono uppercase"
                  />
                  {panNumber.length === 10 && (
                    <p className={`text-xs ${validatePAN(panNumber) ? 'text-success' : 'text-destructive'}`}>
                      {validatePAN(panNumber) ? '✓ Valid PAN Format' : '❌ Invalid PAN Format (Format: ABCDE1234F)'}
                    </p>
                  )}
                </div>

                <div className="space-y-2 pt-2">
                  <Label>PAN Card Document / Image</Label>
                  <div className="border-2 border-dashed border-border rounded-xl p-4 text-center space-y-2 hover:border-primary/50 transition-colors">
                    {panPath || panFile ? (
                      <div className="flex items-center justify-between text-xs text-success">
                        <span className="truncate max-w-[200px]">{panFile ? panFile.name : '✓ PAN Card Uploaded'}</span>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => { setPanFile(null); setPanPath(''); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block space-y-1">
                        <Upload className="h-6 w-6 text-muted-foreground mx-auto" />
                        <span className="text-xs font-semibold text-primary block">Upload PAN Card Image / PDF</span>
                        <span className="text-[10px] text-muted-foreground block">Max 5MB</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={e => { if (e.target.files?.[0]) setPanFile(e.target.files[0]); }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: Working Cities */}
            {step === 6 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary"><MapPin className="h-6 w-6" /></div>
                  <div>
                    <h2 className="text-lg font-bold">Where can you provide services?</h2>
                    <p className="text-xs text-muted-foreground">Select all Gujarat cities you are willing to visit.</p>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto pr-2 space-y-2 border rounded-xl p-3 bg-secondary/20">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {GUJARAT_CITIES.map(city => {
                      const isSelected = selectedCities.includes(city);
                      return (
                        <button
                          key={city}
                          type="button"
                          onClick={() => {
                            setSelectedCities(prev =>
                              isSelected ? prev.filter(c => c !== city) : [...prev, city]
                            );
                          }}
                          className={`p-2 rounded-lg text-xs font-medium text-left border transition-all ${
                            isSelected
                              ? 'bg-primary/20 border-primary text-primary font-bold'
                              : 'bg-card border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}{city}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">{selectedCities.length} cities selected</p>
              </div>
            )}

            {/* STEP 7: Professions & Experience */}
            {step === 7 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary"><Briefcase className="h-6 w-6" /></div>
                  <div>
                    <h2 className="text-lg font-bold">Select Your Services & Experience</h2>
                    <p className="text-xs text-muted-foreground">Choose the professions you are skilled at providing.</p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <Label>Services Offered</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {servicesList.map(svc => {
                      const isSelected = selectedServices.includes(svc.id);
                      const icon = SERVICE_ICONS[svc.name] || '🛠️';
                      return (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() => {
                            setSelectedServices(prev =>
                              isSelected ? prev.filter(s => s !== svc.id) : [...prev, svc.id]
                            );
                          }}
                          className={`p-3 rounded-xl border flex items-center gap-2 text-left transition-all ${
                            isSelected
                              ? 'bg-primary/20 border-primary text-primary font-bold'
                              : 'bg-card border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <span className="text-lg">{icon}</span>
                          <span className="text-xs">{svc.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <Label htmlFor="exp">Years of Experience</Label>
                  <Input
                    id="exp"
                    type="number"
                    min={0}
                    max={50}
                    value={experienceYears}
                    onChange={e => setExperienceYears(parseInt(e.target.value, 10) || 0)}
                    className="glass-input max-w-xs"
                  />
                </div>
              </div>
            )}

            {/* STEP 8: Extras */}
            {step === 8 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary"><Award className="h-6 w-6" /></div>
                  <div>
                    <h2 className="text-lg font-bold">Skills, Certificates & Bio</h2>
                    <p className="text-xs text-muted-foreground">Optional credentials to stand out to customers.</p>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <Label>Skill / Trade Certificate (Optional)</Label>
                  <div className="border-2 border-dashed border-border rounded-xl p-4 text-center space-y-2 hover:border-primary/50 transition-colors">
                    {certificatePath || certificateFile ? (
                      <div className="flex items-center justify-between text-xs text-success">
                        <span className="truncate max-w-[200px]">{certificateFile ? certificateFile.name : '✓ Certificate Uploaded'}</span>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => { setCertificateFile(null); setCertificatePath(''); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block space-y-1">
                        <Upload className="h-6 w-6 text-muted-foreground mx-auto" />
                        <span className="text-xs font-semibold text-primary block">Upload Skill Certificate / License</span>
                        <span className="text-[10px] text-muted-foreground block">Max 5MB</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={e => { if (e.target.files?.[0]) setCertificateFile(e.target.files[0]); }}
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <Label htmlFor="bio">Short Bio / Description</Label>
                  <Textarea
                    id="bio"
                    placeholder="Tell customers about your experience, punctuality, and commitment to quality work..."
                    maxLength={300}
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    className="glass-input h-24 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground text-right">{bio.length}/300 chars</p>
                </div>
              </div>
            )}

            {/* STEP 9: Review & Terms */}
            {step === 9 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-success/20 text-success"><CheckCircle2 className="h-6 w-6" /></div>
                  <div>
                    <h2 className="text-lg font-bold">Review & Submit Verification</h2>
                    <p className="text-xs text-muted-foreground">Please double check your details before submitting.</p>
                  </div>
                </div>

                <div className="space-y-3 bg-secondary/30 rounded-2xl p-4 text-xs space-y-2">
                  <div className="flex justify-between border-b pb-2 border-border">
                    <span className="text-muted-foreground">Full Name:</span>
                    <span className="font-semibold text-foreground">{firstName} {lastName}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2 border-border">
                    <span className="text-muted-foreground">Date of Birth:</span>
                    <span className="font-semibold text-foreground">{dob}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2 border-border">
                    <span className="text-muted-foreground">Aadhaar:</span>
                    <span className="font-semibold text-foreground font-mono">{aadhaarNumber ? maskAadhaar(aadhaarNumber.slice(-4)) : 'Uploaded'}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2 border-border">
                    <span className="text-muted-foreground">PAN:</span>
                    <span className="font-semibold text-foreground font-mono">{maskPAN(panNumber.toUpperCase())}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2 border-border">
                    <span className="text-muted-foreground">Working Cities:</span>
                    <span className="font-semibold text-foreground">{selectedCities.slice(0, 3).join(', ')}{selectedCities.length > 3 ? ` +${selectedCities.length - 3} more` : ''}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2 border-border">
                    <span className="text-muted-foreground">Experience:</span>
                    <span className="font-semibold text-foreground">{experienceYears} Years</span>
                  </div>
                </div>

                {/* Consent & Terms Checkbox */}
                <div className="pt-2 space-y-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="terms"
                      checked={termsAccepted}
                      onCheckedChange={v => setTermsAccepted(v === true)}
                      className="mt-1"
                    />
                    <label htmlFor="terms" className="text-xs text-muted-foreground leading-snug cursor-pointer">
                      I declare that all information and documents uploaded are authentic and belong to me. I agree to the{' '}
                      <button
                        type="button"
                        onClick={() => setShowTermsModal(true)}
                        className="text-primary underline font-semibold"
                      >
                        HandyFix Partner Terms & Conditions ({TERMS_VERSION})
                      </button>.
                    </label>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-8 border-t border-border mt-8">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={step === 1 || saving}
            className="text-xs"
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>

          {step < KYC_TOTAL_STEPS ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={saving}
              className="gold-gradient text-primary-foreground font-semibold text-xs"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save & Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmitKyc}
              disabled={saving || !termsAccepted}
              className="gold-gradient text-primary-foreground font-bold text-xs"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
              Submit Verification
            </Button>
          )}
        </div>
      </Card>

      {/* Terms Modal */}
      <Dialog open={showTermsModal} onOpenChange={setShowTermsModal}>
        <DialogContent className="bg-card border-border max-w-3xl">
          <DialogHeader>
            <DialogTitle>Partner Agreement Terms</DialogTitle>
          </DialogHeader>
          <TermsAndConditions />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KycOnboarding;

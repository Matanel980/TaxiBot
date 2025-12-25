'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { User, Car, Hash, Phone, ArrowRight, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { toast } from 'sonner'

interface OnboardingFlowProps {
  userId: string
  initialPhone: string
  onComplete: (data: any) => void
}

export function OnboardingFlow({ userId, initialPhone, onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    vehicle_number: '',
    car_type: '',
    phone: initialPhone || ''
  })

  const supabase = createClient()

  const handleNext = () => {
    if (step === 1 && !formData.full_name) {
      toast.error('נא להזין שם מלא')
      return
    }
    if (step === 2 && (!formData.vehicle_number || !formData.car_type)) {
      toast.error('נא למלא את כל פרטי הרכב')
      return
    }
    setStep(prev => prev + 1)
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          vehicle_number: formData.vehicle_number,
          car_type: formData.car_type,
          phone: formData.phone,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (error) throw error

      toast.success('הפרופיל עודכן בהצלחה!')
      onComplete(formData)
    } catch (error: any) {
      console.error('Onboarding error:', error)
      toast.error('שגיאה בעדכון הפרופיל')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900 p-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="w-full max-w-md"
        >
          <Card className="glass-card-dark border-white/10 shadow-2xl overflow-hidden">
            <CardHeader className="text-center pt-8">
              <div className="mx-auto w-16 h-16 bg-taxi-yellow/20 rounded-full flex items-center justify-center mb-4">
                {step === 1 && <User className="text-taxi-yellow w-8 h-8" />}
                {step === 2 && <Car className="text-taxi-yellow w-8 h-8" />}
                {step === 3 && <CheckCircle2 className="text-green-500 w-8 h-8" />}
              </div>
              <CardTitle className="text-2xl font-bold text-white">
                {step === 1 && 'ברוך הבא ל-TaxiFlow'}
                {step === 2 && 'פרטי הרכב שלך'}
                {step === 3 && 'כמעט סיימנו!'}
              </CardTitle>
              <CardDescription className="text-slate-400">
                {step === 1 && 'בוא נכיר אותך קצת יותר טוב'}
                {step === 2 && 'הזן את פרטי המונית שלך'}
                {step === 3 && 'אשר את הפרטים והתחל לעבוד'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pb-8 px-6">
              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2 text-right">
                    <Label htmlFor="full_name" className="text-white">שם מלא</Label>
                    <div className="relative">
                      <Input
                        id="full_name"
                        placeholder="ישראל ישראלי"
                        value={formData.full_name}
                        onChange={e => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                        className="bg-white/5 border-white/10 text-white pl-4 pr-10"
                      />
                      <User className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    </div>
                  </div>
                  <div className="space-y-2 text-right">
                    <Label htmlFor="phone" className="text-white">מספר טלפון</Label>
                    <div className="relative">
                      <Input
                        id="phone"
                        value={formData.phone}
                        disabled
                        className="bg-white/5 border-white/10 text-slate-400 pl-4 pr-10 cursor-not-allowed"
                      />
                      <Phone className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2 text-right">
                    <Label htmlFor="vehicle_number" className="text-white">מספר רכב</Label>
                    <div className="relative">
                      <Input
                        id="vehicle_number"
                        placeholder="00-000-00"
                        value={formData.vehicle_number}
                        onChange={e => setFormData(prev => ({ ...prev, vehicle_number: e.target.value }))}
                        className="bg-white/5 border-white/10 text-white pl-4 pr-10"
                      />
                      <Hash className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    </div>
                  </div>
                  <div className="space-y-2 text-right">
                    <Label htmlFor="car_type" className="text-white">דגם רכב (למשל: סקודה אוקטביה)</Label>
                    <div className="relative">
                      <Input
                        id="car_type"
                        placeholder="סקודה אוקטביה"
                        value={formData.car_type}
                        onChange={e => setFormData(prev => ({ ...prev, car_type: e.target.value }))}
                        className="bg-white/5 border-white/10 text-white pl-4 pr-10"
                      />
                      <Car className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4 text-right">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-white font-medium">{formData.full_name}</span>
                      <span className="text-slate-400 text-sm">שם מלא</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white font-medium">{formData.vehicle_number}</span>
                      <span className="text-slate-400 text-sm">מספר רכב</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white font-medium">{formData.car_type}</span>
                      <span className="text-slate-400 text-sm">דגם רכב</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 text-center">
                    בלחיצה על "סיום", אתה מאשר שכל הפרטים נכונים
                  </p>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                {step < 3 ? (
                  <>
                    {step > 1 && (
                      <Button
                        variant="outline"
                        onClick={() => setStep(prev => prev - 1)}
                        className="flex-1 border-white/10 text-white hover:bg-white/5"
                      >
                        חזור
                      </Button>
                    )}
                    <Button
                      onClick={handleNext}
                      className="flex-1 bg-taxi-yellow text-slate-900 hover:bg-taxi-yellow/90 font-bold"
                    >
                      המשך
                      <ArrowRight size={18} className="mr-2" />
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="w-full bg-green-600 text-white hover:bg-green-700 font-bold h-12 text-lg"
                  >
                    {loading ? 'מעדכן...' : 'סיום והתחלת עבודה'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}


'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  Save, 
  Loader2,
  Image,
  Type,
  List,
  AlignLeft,
  Mail,
  Phone,
  Plus,
  Trash2,
  GripVertical,
  Eye
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'

interface FormField {
  id: string
  type: 'text' | 'textarea' | 'select' | 'email' | 'phone'
  label: string
  placeholder?: string
  required: boolean
  options?: string[]
  prefill?: string
}

interface Landing {
  title: string
  subtitle: string
  description: string
  cover_image_url: string
  background_color: string
  text_color: string
  accent_color: string
  show_member_count: boolean
  show_org_logo: boolean
  benefits: { icon: string; text: string }[]
  cta_button_text: string
}

interface SuccessPage {
  title: string
  message: string
}

const defaultLanding: Landing = {
  title: '',
  subtitle: '',
  description: '',
  cover_image_url: '',
  background_color: '#ffffff',
  text_color: '#1f2937',
  accent_color: '#4f46e5',
  show_member_count: true,
  show_org_logo: true,
  benefits: [],
  cta_button_text: 'Подать заявку'
}

const defaultSuccessPage: SuccessPage = {
  title: 'Заявка отправлена!',
  message: 'Мы рассмотрим вашу заявку и свяжемся с вами'
}

const fieldTypes = [
  { type: 'text', label: 'Текст', icon: Type },
  { type: 'textarea', label: 'Длинный текст', icon: AlignLeft },
  { type: 'select', label: 'Выбор', icon: List },
  { type: 'email', label: 'Email', icon: Mail },
  { type: 'phone', label: 'Телефон', icon: Phone },
] as const

interface NewFormPageProps {
  orgId?: string
  pipelineId?: string
  existingForm?: any
  isEdit?: boolean
  orgName?: string
  orgLogoUrl?: string | null
}

export default function NewFormPage({ 
  orgId: propsOrgId, 
  pipelineId: propsPipelineId,
  existingForm,
  isEdit = false,
  orgName: propsOrgName,
  orgLogoUrl: propsOrgLogoUrl
}: NewFormPageProps = {}) {
  const router = useRouter()
  const params = useParams()
  const orgId = propsOrgId || (params.org as string)
  const pipelineId = propsPipelineId || (params.id as string)
  const formId = existingForm?.id
  
  const [activeTab, setActiveTab] = useState<'landing' | 'form' | 'success'>('landing')
  const [name, setName] = useState(existingForm?.name || 'Форма заявки')
  const [landing, setLanding] = useState<Landing>(existingForm?.landing || defaultLanding)
  const [formFields, setFormFields] = useState<FormField[]>(
    existingForm?.form_schema?.length > 0
      ? existingForm.form_schema
      : [{ id: '1', type: 'text', label: 'Имя', placeholder: 'Ваше имя', required: true, prefill: 'telegram_name' }]
  )
  const [successPage, setSuccessPage] = useState<SuccessPage>(existingForm?.success_page || defaultSuccessPage)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgName, setOrgName] = useState(propsOrgName || '')
  const [orgLogoUrl, setOrgLogoUrl] = useState(propsOrgLogoUrl || null)
  
  // Fetch org data if not provided (for new form page)
  useEffect(() => {
    if (!propsOrgName && orgId) {
      fetch(`/api/organizations/${orgId}`)
        .then(res => res.json())
        .then(data => {
          const org = data.organization
          if (org?.name) setOrgName(org.name)
          if (org?.logo_url) setOrgLogoUrl(org.logo_url)
        })
        .catch(() => {})
    }
  }, [orgId, propsOrgName])

  const handleAddField = (type: FormField['type']) => {
    const newField: FormField = {
      id: Date.now().toString(),
      type,
      label: type === 'email' ? 'Email' : type === 'phone' ? 'Телефон' : 'Новое поле',
      placeholder: '',
      required: false,
      options: type === 'select' ? ['Вариант 1', 'Вариант 2'] : undefined
    }
    setFormFields([...formFields, newField])
  }

  const handleUpdateField = (id: string, updates: Partial<FormField>) => {
    setFormFields(formFields.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  const handleRemoveField = (id: string) => {
    setFormFields(formFields.filter(f => f.id !== id))
  }

  const handleAddBenefit = () => {
    setLanding({
      ...landing,
      benefits: [...landing.benefits, { icon: 'check', text: '' }]
    })
  }

  const handleUpdateBenefit = (idx: number, text: string) => {
    const benefits = [...landing.benefits]
    benefits[idx] = { ...benefits[idx], text }
    setLanding({ ...landing, benefits })
  }

  const handleRemoveBenefit = (idx: number) => {
    setLanding({
      ...landing,
      benefits: landing.benefits.filter((_, i) => i !== idx)
    })
  }

  const handleSave = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const url = isEdit 
        ? `/api/applications/forms/${formId}`
        : '/api/applications/forms'
      
      const method = isEdit ? 'PATCH' : 'POST'
      
      const body: any = {
        name: name.trim() || 'Форма заявки',
        landing,
        form_schema: formFields,
        success_page: successPage,
        settings: {
          require_form: formFields.length > 0,
          spam_detection: { enabled: true }
        }
      }
      
      if (!isEdit) {
        body.org_id = orgId
        body.pipeline_id = pipelineId
      }
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || `Не удалось ${isEdit ? 'обновить' : 'создать'} форму`)
      }
      
      router.push(`/p/${orgId}/applications/pipelines/${pipelineId}/forms`)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/p/${orgId}/applications/pipelines/${pipelineId}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-lg font-semibold border-0 p-0 h-auto focus-visible:ring-0"
                  placeholder="Название формы"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Eye className="w-4 h-4 mr-2" />
                Предпросмотр
              </Button>
              <Button onClick={handleSave} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Сохранить
              </Button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {(['landing', 'form', 'success'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {tab === 'landing' && 'Лендинг'}
                {tab === 'form' && 'Анкета'}
                {tab === 'success' && 'Успех'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Landing Tab */}
        {activeTab === 'landing' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Settings */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Основное</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Служебное название формы</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Форма заявки"
                    />
                    <p className="text-xs text-neutral-500">
                      Это название видно только вам в списке форм
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Заголовок (для пользователя)</Label>
                    <Input
                      value={landing.title}
                      onChange={(e) => setLanding({ ...landing, title: e.target.value })}
                      placeholder="Название сообщества"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Подзаголовок</Label>
                    <Input
                      value={landing.subtitle}
                      onChange={(e) => setLanding({ ...landing, subtitle: e.target.value })}
                      placeholder="Краткое описание"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Описание</Label>
                    <Textarea
                      value={landing.description}
                      onChange={(e) => setLanding({ ...landing, description: e.target.value })}
                      placeholder="Подробное описание..."
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>URL обложки</Label>
                    <Input
                      value={landing.cover_image_url}
                      onChange={(e) => setLanding({ ...landing, cover_image_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Преимущества</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {landing.benefits.map((benefit, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={benefit.text}
                        onChange={(e) => handleUpdateBenefit(idx, e.target.value)}
                        placeholder="Преимущество..."
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveBenefit(idx)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddBenefit}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Добавить
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Настройки</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Показывать лого организации</Label>
                      <Switch
                        checked={landing.show_org_logo}
                        onCheckedChange={(checked) => setLanding({ ...landing, show_org_logo: checked })}
                      />
                    </div>
                    {landing.show_org_logo && (
                      <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg">
                        {orgLogoUrl ? (
                          <img 
                            src={orgLogoUrl} 
                            alt={orgName}
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-neutral-200 flex items-center justify-center text-neutral-500 text-xs">
                            Нет лого
                          </div>
                        )}
                        <div className="text-sm">
                          <div className="font-medium">{orgName || 'Организация'}</div>
                          <div className="text-neutral-500 text-xs">
                            {orgLogoUrl ? 'Логотип будет показан' : 'Загрузите логотип в настройках организации'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Показывать количество участников</Label>
                    <Switch
                      checked={landing.show_member_count}
                      onCheckedChange={(checked) => setLanding({ ...landing, show_member_count: checked })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Текст кнопки</Label>
                    <Input
                      value={landing.cta_button_text}
                      onChange={(e) => setLanding({ ...landing, cta_button_text: e.target.value })}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Preview */}
            <div className="lg:sticky lg:top-32 h-fit">
              <Card>
                <CardHeader>
                  <CardTitle>Предпросмотр</CardTitle>
                </CardHeader>
                <CardContent>
                  <div 
                    className="rounded-xl overflow-hidden border"
                    style={{ 
                      backgroundColor: landing.background_color,
                      color: landing.text_color
                    }}
                  >
                    {landing.cover_image_url && (
                      <div className="h-32 bg-neutral-200">
                        <img 
                          src={landing.cover_image_url}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => e.currentTarget.style.display = 'none'}
                        />
                      </div>
                    )}
                    <div className="p-4">
                      {landing.show_org_logo && (
                        <div className="w-12 h-12 rounded-lg bg-neutral-200 mb-3" />
                      )}
                      <h3 className="text-lg font-bold">
                        {landing.title || 'Заголовок'}
                      </h3>
                      {landing.subtitle && (
                        <p className="text-sm opacity-80 mt-1">{landing.subtitle}</p>
                      )}
                      {landing.benefits.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {landing.benefits.map((b, i) => (
                            <div 
                              key={i}
                              className="flex items-center gap-2 text-sm p-2 rounded-lg"
                              style={{ backgroundColor: `${landing.accent_color}15` }}
                            >
                              <span style={{ color: landing.accent_color }}>✓</span>
                              {b.text || 'Преимущество'}
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        className="w-full mt-4 py-2 rounded-lg text-white font-medium"
                        style={{ backgroundColor: landing.accent_color }}
                      >
                        {landing.cta_button_text}
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Form Tab */}
        {activeTab === 'form' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Поля анкеты</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {formFields.map((field, idx) => (
                    <div 
                      key={field.id}
                      className="p-4 border rounded-lg bg-white"
                    >
                      <div className="flex items-start gap-3">
                        <GripVertical className="w-5 h-5 text-neutral-400 mt-2 cursor-grab" />
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2">
                            <Input
                              value={field.label}
                              onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                              className="flex-1"
                              placeholder="Название поля"
                            />
                            <select
                              value={field.type}
                              onChange={(e) => handleUpdateField(field.id, { 
                                type: e.target.value as FormField['type'],
                                options: e.target.value === 'select' ? ['Вариант 1', 'Вариант 2'] : undefined
                              })}
                              className="px-3 py-2 border rounded-lg text-sm"
                            >
                              {fieldTypes.map(t => (
                                <option key={t.type} value={t.type}>{t.label}</option>
                              ))}
                            </select>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveField(field.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                          <Input
                            value={field.placeholder || ''}
                            onChange={(e) => handleUpdateField(field.id, { placeholder: e.target.value })}
                            placeholder="Подсказка (placeholder)"
                            className="text-sm"
                          />
                          {field.type === 'select' && (
                            <Textarea
                              value={field.options?.join('\n') || ''}
                              onChange={(e) => handleUpdateField(field.id, { 
                                options: e.target.value.split('\n').filter(Boolean)
                              })}
                              placeholder="Варианты (каждый с новой строки)"
                              rows={3}
                              className="text-sm"
                            />
                          )}
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={field.required}
                              onCheckedChange={(checked) => handleUpdateField(field.id, { required: checked })}
                            />
                            <span className="text-sm text-neutral-600">Обязательное</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <div className="flex flex-wrap gap-2 pt-2">
                    {fieldTypes.map(t => (
                      <Button
                        key={t.type}
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddField(t.type)}
                      >
                        <t.icon className="w-4 h-4 mr-1" />
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Preview */}
            <div className="lg:sticky lg:top-32 h-fit">
              <Card>
                <CardHeader>
                  <CardTitle>Предпросмотр</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 bg-neutral-50 rounded-xl border space-y-4">
                    {formFields.map((field) => (
                      <div key={field.id}>
                        <label className="block text-sm font-medium mb-1">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        {field.type === 'textarea' ? (
                          <textarea
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            rows={3}
                            disabled
                          />
                        ) : field.type === 'select' ? (
                          <select className="w-full px-3 py-2 border rounded-lg text-sm" disabled>
                            <option>Выберите...</option>
                            {field.options?.map((opt, i) => (
                              <option key={i}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type}
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            disabled
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Success Tab */}
        {activeTab === 'success' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Страница успеха</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Заголовок</Label>
                  <Input
                    value={successPage.title}
                    onChange={(e) => setSuccessPage({ ...successPage, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Сообщение</Label>
                  <Textarea
                    value={successPage.message}
                    onChange={(e) => setSuccessPage({ ...successPage, message: e.target.value })}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card>
              <CardHeader>
                <CardTitle>Предпросмотр</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-8 bg-neutral-50 rounded-xl border text-center">
                  <div 
                    className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{ backgroundColor: `${landing.accent_color}20` }}
                  >
                    <svg 
                      className="w-8 h-8" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke={landing.accent_color}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2">{successPage.title}</h3>
                  <p className="text-neutral-600">{successPage.message}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

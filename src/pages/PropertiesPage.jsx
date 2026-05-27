import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, Plus, Search, Home, Bed, Bath, Maximize,
  MapPin, X, Filter, Image as ImageIcon, Edit3, Trash2, ExternalLink,
  Download, Users, Globe, AlertCircle, DollarSign, Calendar,
  Loader2, FileText, Camera, Link as LinkIcon, Copy, Share2, Sparkles,
  ChevronLeft, ChevronRight, MessageCircle, Mail, Phone, Star,
  Eye, Target, Clock, Layers, CheckCircle2, ChevronDown, RefreshCw, Send,
  ArrowRight, ShieldCheck, ThumbsUp, Lightbulb, FileSpreadsheet, Handshake
} from 'lucide-react'
import { useStore } from '../lib/store'
import {
  formatCurrency, getPropertyTypeLabel, getOperationLabel,
  getInitials, formatDate, formatFullDate
} from '../utils/formatters'
import toast from 'react-hot-toast'

const typeOptions = [
  { value: 'apartment', label: 'Apartamento' },
  { value: 'house', label: 'Casa' },
  { value: 'penthouse', label: 'Ático' },
  { value: 'studio', label: 'Estudio' },
  { value: 'duplex', label: 'Dúplex' },
  { value: 'townhouse', label: 'Adosado' },
  { value: 'villa', label: 'Villa' },
  { value: 'land', label: 'Terreno' },
  { value: 'commercial', label: 'Local Comercial' },
  { value: 'office', label: 'Oficina' },
  { value: 'garage', label: 'Garaje' },
  { value: 'warehouse', label: 'Nave Industrial' },
]

const tabs = [
  { id: 'all', label: 'Todas' },
  { id: 'manual', label: 'Manuales' },
  { id: 'idealista', label: 'Idealista' },
  { id: 'sale', label: 'Venta' },
  { id: 'rent', label: 'Alquiler' },
  { id: 'disponible', label: 'Disponibles' },
  { id: 'incomplete', label: 'Incompletas' },
]

const conditionLabels = {
  nuevo: 'Nuevo',
  reformado: 'Reformado',
  buen_estado: 'Buen estado',
  a_reformar: 'A reformar',
  obra_nueva: 'Obra nueva'
}

const conditionOptions = [
  { value: '', label: 'Sin especificar' },
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'reformado', label: 'Reformado' },
  { value: 'buen_estado', label: 'Buen estado' },
  { value: 'a_reformar', label: 'A reformar' },
  { value: 'obra_nueva', label: 'Obra nueva' },
]

const portalColors = {
  manual: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  idealista: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  fotocasa: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  habitaclia: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pisoscom: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  csv: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  ia: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
}

const portalLabels = {
  manual: 'Manual',
  idealista: 'Idealista',
  fotocasa: 'Fotocasa',
  habitaclia: 'Habitaclia',
  pisoscom: 'Pisos.com',
  csv: 'CSV',
  ia: 'Generado con IA',
}

const propertyStatusColors = {
  disponible: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  reservado: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  vendido: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  alquilado: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
}

const propertyStatusLabels = {
  disponible: 'Disponible',
  reservado: 'Reservado',
  vendido: 'Vendido',
  alquilado: 'Alquilado',
}

const propertyTypeIcons = {
  apartment: Home,
  house: Home,
  penthouse: Home,
  studio: Home,
  duplex: Home,
  townhouse: Home,
  villa: Home,
  land: MapPin,
  commercial: Building2,
  office: Building2,
  garage: Building2,
  warehouse: Building2,
}

// Simulated commercial agents (from team)
const commercialAgents = [
  { id: 't1', name: 'Carlos Ruiz García' },
  { id: 't2', name: 'Laura Sánchez Pérez' },
  { id: 't3', name: 'Marta Pérez López' },
  { id: 't6', name: 'Roberto Medina Sánchez' },
]

function parseImagesProperty(val) {
  if (!val) return []
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch {}
    return val.split(',').map(s => s.trim()).filter(Boolean)
  }
  return Array.isArray(val) ? val : []
}

function parseFeaturesList(val) {
  if (!val) return []
  try {
    if (typeof val === 'string') return JSON.parse(val)
    return Array.isArray(val) ? val : []
  } catch {
    return []
  }
}

function computeQualityScore(p) {
  let s = 0
  const images = parseImagesProperty(p.images)
  if (images.length > 0) s += 20
  if (p.description && p.description.trim() !== '') s += 20
  if (p.price && p.price > 0) s += 20
  if (p.city && p.city.trim() !== '') s += 15
  if (p.surface && p.surface > 0) s += 10
  if (p.bedrooms > 0) s += 5
  if (p.bathrooms > 0) s += 5
  if (p.has_elevator || p.has_terrace || p.has_garage) s += 5
  return s
}

function getQualityColor(score) {
  if (score >= 80) return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10'
  if (score >= 50) return 'text-amber-400 border-amber-500/20 bg-amber-500/10'
  return 'text-rose-400 border-rose-500/20 bg-rose-500/10'
}

export default function PropertiesPage() {
  const {
    properties, fetchProperties, createProperty, updateProperty, deleteProperty,
    importPropertyFromUrl, importPropertiesFromIdealista, importPropertiesFromCsv,
    previewCsv, duplicateProperty, changePropertyStatus, shareProperty,
    fetchProperty, fetchPropertyMetrics, fetchPropertyInterests, createPropertyInterest,
    deletePropertyInterest, createPropertyAI, improvePropertyAI, generateMarketingAsset,
    fetchPropertyActivity, fetchCompatibleLeads, scrapePropertyUrl, loading, leads
  } = useStore()

  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [activeAlert, setActiveAlert] = useState(null)

  // Filter states
  const [typeFilter, setTypeFilter] = useState('')
  const [operationFilter, setOperationFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [bedroomsFilter, setBedroomsFilter] = useState('')
  const [bathroomsFilter, setBathroomsFilter] = useState('')
  const [surfaceMin, setSurfaceMin] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [zoneFilter, setZoneFilter] = useState('')
  const [withPhotos, setWithPhotos] = useState('')
  const [withDescription, setWithDescription] = useState('')

  const [metrics, setMetrics] = useState(null)
  const [loadingMetrics, setLoadingMetrics] = useState(false)

  const detectPortal = (url) => {
    const u = url.toLowerCase()
    if (u.includes('idealista')) return 'idealista'
    if (u.includes('fotocasa')) return 'fotocasa'
    if (u.includes('habitaclia')) return 'habitaclia'
    if (u.includes('pisos.com')) return 'pisoscom'
    return null
  }

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingProperty, setEditingProperty] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)

  // Detail drawer
  const [drawerProperty, setDrawerProperty] = useState(null)
  const [drawerTab, setDrawerTab] = useState('resumen')
  const [drawerData, setDrawerData] = useState(null)
  const [loadingDrawer, setLoadingDrawer] = useState(false)
  const [galleryIdx, setGalleryIdx] = useState(0)

  // Create modal mode
  const [createMode, setCreateMode] = useState('manual') // 'manual' | 'ai'

  // Import / Scraping
  const [importMode, setImportMode] = useState('url') // 'url' | 'csv'
  const [importUrls, setImportUrls] = useState('')
  const [importCsvInput, setImportCsvInput] = useState('')
  const [csvPreview, setCsvPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState(null)

  // AI creation
  const [aiSnippet, setAiSnippet] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiPreviewData, setAiPreviewData] = useState(null)

  // Marketing IA & improvements IA
  const [loadingMarketing, setLoadingMarketing] = useState(false)
  const [marketingAssetContent, setMarketingAssetContent] = useState(null)
  const [marketingAssetType, setMarketingAssetType] = useState('idealista_desc')
  const [loadingImprovement, setLoadingImprovement] = useState(false)
  const [improvementData, setImprovementData] = useState(null)

  const [formData, setFormData] = useState({
    title: '', type: 'apartment', operation_type: 'sale', price: '',
    city: '', zone: '', address: '', province: '', postal_code: '',
    bedrooms: '', bathrooms: '', surface: '', floor: '',
    has_elevator: false, has_terrace: false, has_garage: false,
    condition: '', description: '', features: '', images: '', public_url: '',
    status: 'disponible', assigned_to: '', office_id: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchProperties()
    loadMetrics()
  }, [])

  const loadMetrics = async () => {
    setLoadingMetrics(true)
    try {
      const data = await fetchPropertyMetrics()
      setMetrics(data)
    } catch (e) {
      console.error('loadMetrics error:', e)
    } finally {
      setLoadingMetrics(false)
    }
  }

  // Memoized lists filtering
  const displayProperties = useMemo(() => {
    let result = properties || []

    // Tab filters
    if (activeTab === 'manual') result = result.filter(p => p.source === 'manual' || !p.source)
    else if (activeTab === 'idealista') result = result.filter(p => p.source === 'idealista' || p.external_source === 'idealista')
    else if (activeTab === 'sale') result = result.filter(p => (p.operation_type || 'sale') === 'sale')
    else if (activeTab === 'rent') result = result.filter(p => p.operation_type === 'rent')
    else if (activeTab === 'disponible') result = result.filter(p => p.status === 'disponible')
    else if (activeTab === 'incomplete') result = result.filter(p => {
      const pImages = parseImagesProperty(p.images)
      return pImages.length === 0 || !p.description || p.description.trim() === '' || !p.price || p.price === 0 || !p.surface || !p.city
    })

    // Active alert filters
    if (activeAlert) {
      if (activeAlert === 'sin_fotos') result = result.filter(p => { const img = parseImagesProperty(p.images); return img.length === 0 })
      else if (activeAlert === 'sin_desc') result = result.filter(p => !p.description || p.description.trim() === '')
      else if (activeAlert === 'sin_surface') result = result.filter(p => !p.surface || p.surface === 0)
      else if (activeAlert === 'sin_price') result = result.filter(p => !p.price || p.price === 0)
      else if (activeAlert === 'incomplete') result = result.filter(p => {
        const pImages = parseImagesProperty(p.images)
        return pImages.length === 0 || !p.description || p.description.trim() === '' || !p.price || p.price === 0 || !p.surface || !p.city
      })
    }

    // Filters form
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.title?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.zone?.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q) ||
        p.province?.toLowerCase().includes(q)
      )
    }

    if (typeFilter) result = result.filter(p => p.type === typeFilter)
    if (operationFilter) result = result.filter(p => (p.operation_type || 'sale') === operationFilter)
    if (statusFilter) result = result.filter(p => p.status === statusFilter)
    if (priceMin) result = result.filter(p => p.price >= Number(priceMin))
    if (priceMax) result = result.filter(p => p.price <= Number(priceMax))
    if (bedroomsFilter) result = result.filter(p => p.bedrooms >= Number(bedroomsFilter))
    if (bathroomsFilter) result = result.filter(p => p.bathrooms >= Number(bathroomsFilter))
    if (surfaceMin) result = result.filter(p => p.surface >= Number(surfaceMin))
    if (sourceFilter) result = result.filter(p => (p.source || 'manual') === sourceFilter)
    if (cityFilter) result = result.filter(p => p.city?.toLowerCase().includes(cityFilter.toLowerCase()))
    if (zoneFilter) result = result.filter(p => p.zone?.toLowerCase().includes(zoneFilter.toLowerCase()))

    if (withPhotos === 'yes') result = result.filter(p => parseImagesProperty(p.images).length > 0)
    if (withPhotos === 'no') result = result.filter(p => parseImagesProperty(p.images).length === 0)
    if (withDescription === 'yes') result = result.filter(p => p.description && p.description.trim() !== '')
    if (withDescription === 'no') result = result.filter(p => !p.description || p.description.trim() === '')

    return result
  }, [properties, activeTab, search, typeFilter, operationFilter, statusFilter,
    priceMin, priceMax, bedroomsFilter, bathroomsFilter, surfaceMin, sourceFilter,
    cityFilter, zoneFilter, withPhotos, withDescription, activeAlert])

  const activeFiltersCount = useMemo(() => {
    let c = 0
    if (typeFilter) c++
    if (operationFilter) c++
    if (statusFilter) c++
    if (priceMin) c++
    if (priceMax) c++
    if (bedroomsFilter) c++
    if (bathroomsFilter) c++
    if (surfaceMin) c++
    if (sourceFilter) c++
    if (cityFilter) c++
    if (zoneFilter) c++
    if (withPhotos) c++
    if (withDescription) c++
    return c
  }, [typeFilter, operationFilter, statusFilter, priceMin, priceMax, bedroomsFilter, bathroomsFilter, surfaceMin, sourceFilter, cityFilter, zoneFilter, withPhotos, withDescription])

  const qualityAlerts = useMemo(() => {
    if (!properties) return []
    const a = []
    const sf = properties.filter(p => parseImagesProperty(p.images).length === 0)
    if (sf.length > 0) a.push({ id: 'sin_fotos', icon: Camera, text: `${sf.length} sin fotos`, count: sf.length })
    const sd = properties.filter(p => !p.description || p.description.trim() === '')
    if (sd.length > 0) a.push({ id: 'sin_desc', icon: FileText, text: `${sd.length} sin descripción`, count: sd.length })
    const ssurf = properties.filter(p => !p.surface || p.surface === 0)
    if (ssurf.length > 0) a.push({ id: 'sin_surface', icon: Maximize, text: `${ssurf.length} sin superficie`, count: ssurf.length })
    const sprice = properties.filter(p => !p.price || p.price === 0)
    if (sprice.length > 0) a.push({ id: 'sin_price', icon: DollarSign, text: `${sprice.length} sin precio`, count: sprice.length })
    return a
  }, [properties])

  const handleAlertClick = (alertId) => {
    setActiveAlert(activeAlert === alertId ? null : alertId)
    setActiveTab('all')
  }

  // manual creation
  const handleAddProperty = async () => {
    if (!formData.title.trim() || !formData.price || !formData.city.trim()) {
      toast.error('Por favor, rellene título, precio y ciudad.')
      return
    }
    setSaving(true)
    try {
      await createProperty({
        ...formData,
        price: Number(formData.price),
        bedrooms: formData.bedrooms ? Number(formData.bedrooms) : 0,
        bathrooms: formData.bathrooms ? Number(formData.bathrooms) : 0,
        surface: formData.surface ? Number(formData.surface) : null,
        features: formData.features ? formData.features.split(',').map(f => f.trim()).filter(Boolean) : [],
        images: formData.images ? formData.images.split(',').map(f => f.trim()).filter(Boolean) : [],
        source: 'manual',
      })
      setShowAddModal(false)
      resetForm()
      loadMetrics()
      fetchProperties()
      toast.success('¡Propiedad creada con éxito!')
    } catch (e) {
      toast.error('Error al guardar la propiedad.')
    } finally {
      setSaving(false)
    }
  }

  // manual edit
  const handleEditProperty = async () => {
    if (!editingProperty) return
    setSaving(true)
    try {
      await updateProperty(editingProperty.id, {
        ...formData,
        price: Number(formData.price),
        bedrooms: formData.bedrooms ? Number(formData.bedrooms) : 0,
        bathrooms: formData.bathrooms ? Number(formData.bathrooms) : 0,
        surface: formData.surface ? Number(formData.surface) : null,
        features: formData.features ? formData.features.split(',').map(f => f.trim()).filter(Boolean) : [],
        images: formData.images ? formData.images.split(',').map(f => f.trim()).filter(Boolean) : [],
      })
      setShowEditModal(false)
      setEditingProperty(null)
      fetchProperties()
      loadMetrics()
      if (drawerProperty?.id === editingProperty.id) {
        openDetail({ ...drawerProperty, ...formData })
      }
      toast.success('¡Propiedad actualizada con éxito!')
    } catch (e) {
      toast.error('Error al actualizar la propiedad.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (property) => {
    try {
      await deleteProperty(property.id)
      setShowDeleteConfirm(null)
      if (drawerProperty?.id === property.id) setDrawerProperty(null)
      loadMetrics()
      fetchProperties()
      toast.success('Propiedad eliminada correctamente.')
    } catch {
      toast.error('Error al eliminar la propiedad.')
    }
  }

  const handleDuplicate = async (prop, e) => {
    e?.stopPropagation()
    try {
      await duplicateProperty(prop.id)
      loadMetrics()
      fetchProperties()
      toast.success('Propiedad duplicada correctamente.')
    } catch {
      toast.error('Error al duplicar la propiedad.')
    }
  }

  const handleQuickStatus = async (prop, st, e) => {
    e?.stopPropagation()
    try {
      await changePropertyStatus(prop.id, st)
      loadMetrics()
      fetchProperties()
      if (drawerProperty?.id === prop.id) {
        setDrawerProperty(prev => ({ ...prev, status: st }))
      }
      toast.success(`Propiedad cambiada a: ${propertyStatusLabels[st]}`)
    } catch {
      toast.error('Error al cambiar el estado.')
    }
  }

  const handleShare = async (prop, e) => {
    e?.stopPropagation()
    try {
      const r = await shareProperty(prop.id)
      if (r.public_url) {
        navigator.clipboard?.writeText(r.public_url)
        toast.success('¡Enlace público copiado al portapapeles!')
      }
    } catch {
      toast.error('Error al compartir la propiedad.')
    }
  }

  // Import URL
  const handleImport = async () => {
    setImporting(true)
    setImportResults(null)
    try {
      if (importMode === 'url') {
        const urls = importUrls.split('\n').map(u => u.trim()).filter(Boolean)
        if (urls.length === 0) {
          toast.error('Introduzca al menos una URL.')
          setImporting(false)
          return
        }
        
        let created = []
        let duplicates = []
        let errors = []

        for (const u of urls) {
          try {
            // First scrape to check for blocked or get basic info
            const scrape = await scrapePropertyUrl(u)
            if (scrape.blocked) {
              // Create preliminary sheet
              const added = await createProperty({
                title: scrape.title || 'Propiedad preliminar',
                price: scrape.price || 0,
                description: scrape.description || 'Importación incompleta debido a restricciones del portal.',
                type: scrape.type || 'apartment',
                operation_type: scrape.operationType || 'sale',
                city: scrape.city || 'Pendiente',
                zone: scrape.zone || '',
                source: scrape.portal || 'imported_url',
                external_url: u,
                external_id: scrape.external_id || '',
              })
              created.push(added)
            } else {
              // Successfully scraped, add full details
              const added = await createProperty({
                title: scrape.title || 'Propiedad importada',
                price: scrape.price || 0,
                description: scrape.description || '',
                type: scrape.type || 'apartment',
                operation_type: scrape.operationType || 'sale',
                city: scrape.city || 'Sin especificar',
                zone: scrape.zone || '',
                images: scrape.images || [],
                source: scrape.portal || 'imported_url',
                external_url: u,
                external_id: scrape.external_id || '',
              })
              created.push(added)
            }
          } catch (e) {
            // If already exists check
            if (e.message?.includes('duplicate') || e.status === 409) {
              duplicates.push({ url: u })
            } else {
              errors.push({ url: u, error: e.message || 'Error desconocido' })
            }
          }
        }

        setImportResults({ created, duplicates, errors })
      } else {
        // CSV import
        if (!importCsvInput.trim()) {
          toast.error('Introduzca o pegue datos CSV.')
          setImporting(false)
          return
        }
        const r = await importPropertiesFromCsv(importCsvInput)
        setImportResults({
          created: r.imported || [],
          duplicates: r.errors?.filter(err => err.error?.includes('duplicada')) || [],
          errors: r.errors?.filter(err => !err.error?.includes('duplicada')) || []
        })
      }
      loadMetrics()
      fetchProperties()
      toast.success('Importación finalizada.')
    } catch (e) {
      toast.error('Error durante la importación.')
    } finally {
      setImporting(false)
    }
  }

  const handleImportDone = () => {
    setShowImportModal(false)
    setImportUrls('')
    setImportCsvInput('')
    setCsvPreview(null)
    setImportResults(null)
    fetchProperties()
  }

  const handleCsvPreview = async () => {
    if (!importCsvInput.trim()) return
    try {
      const p = await previewCsv(importCsvInput)
      setCsvPreview(p)
    } catch {
      toast.error('Error al previsualizar el CSV.')
    }
  }

  // AI creation flow
  const handleCreateAI = async () => {
    if (!aiSnippet.trim()) {
      toast.error('Por favor, describa brevemente el anuncio para la IA.')
      return
    }
    setAiGenerating(true)
    setAiPreviewData(null)
    try {
      const res = await createPropertyAI(aiSnippet)
      setAiPreviewData(res)
      toast.success('¡Anuncio y marketing generados con IA con éxito!')
    } catch {
      toast.error('Error al generar la propiedad con IA.')
    } finally {
      setAiGenerating(false)
    }
  }

  const handleSaveAICreated = async () => {
    if (!aiPreviewData) return
    setSaving(true)
    try {
      const f = aiPreviewData.fields
      await createProperty({
        title: f.title,
        description: f.description,
        price: Number(f.price),
        type: f.type,
        operation_type: f.operation_type || 'sale',
        city: f.city,
        zone: f.zone || '',
        bedrooms: Number(f.bedrooms || 0),
        bathrooms: Number(f.bathrooms || 0),
        surface: Number(f.surface || 0),
        has_elevator: f.has_elevator ? 1 : 0,
        has_terrace: f.has_terrace ? 1 : 0,
        has_garage: f.has_garage ? 1 : 0,
        features: f.features || [],
        source: 'ia',
        ai_generated: 1,
        marketing_assets: JSON.stringify(aiPreviewData.marketing),
      })
      setShowAddModal(false)
      setCreateMode('manual')
      setAiSnippet('')
      setAiPreviewData(null)
      fetchProperties()
      loadMetrics()
      toast.success('¡Ficha creada e integrada en elCRM!')
    } catch (e) {
      toast.error('Error al guardar la propiedad generada con IA.')
    } finally {
      setSaving(false)
    }
  }

  // Detail drawer loading
  const openDetail = async (property) => {
    setDrawerProperty(property)
    setDrawerTab('resumen')
    setLoadingDrawer(true)
    setMarketingAssetContent(null)
    setImprovementData(null)
    setGalleryIdx(0)
    try {
      const detail = await fetchProperty(property.id)
      const interests = await fetchPropertyInterests(property.id)
      const compat = await fetchCompatibleLeads(property.id)
      const acts = await fetchPropertyActivity(property.id)
      
      setDrawerData({
        ...detail,
        interests: interests || [],
        compatible_leads: compat?.leads || compat || [],
        activities: acts || [],
        interested_count: interests?.length || 0,
        compatible_count: compat?.leads?.length || compat?.length || 0,
      })
    } catch (err) {
      console.error('openDetail loading error:', err)
      setDrawerData({
        ...property,
        interests: [],
        compatible_leads: [],
        activities: [],
        interested_count: 0,
        compatible_count: 0,
      })
    } finally {
      setLoadingDrawer(false)
    }
  }

  const openEdit = (property, e) => {
    e?.stopPropagation()
    setEditingProperty(property)
    setFormData({
      title: property.title || '', type: property.type || 'apartment', operation_type: property.operation_type || 'sale',
      price: property.price?.toString() || '', city: property.city || '', zone: property.zone || '',
      address: property.address || '', province: property.province || '', postal_code: property.postal_code || '',
      bedrooms: property.bedrooms?.toString() || '', bathrooms: property.bathrooms?.toString() || '',
      surface: property.surface?.toString() || '', floor: property.floor || '',
      has_elevator: !!property.has_elevator, has_terrace: !!property.has_terrace, has_garage: !!property.has_garage,
      condition: property.condition || '', description: property.description || '',
      features: property.features ? (typeof property.features === 'string' ? property.features : property.features.join(', ')) : '',
      images: property.images ? (typeof property.images === 'string' ? property.images : property.images.join(', ')) : '',
      public_url: property.public_url || '', status: property.status || 'disponible', assigned_to: property.assigned_to || '',
      office_id: property.office_id || '',
    })
    setShowEditModal(true)
  }

  const resetForm = () => {
    setFormData({
      title: '', type: 'apartment', operation_type: 'sale', price: '', city: '', zone: '',
      address: '', province: '', postal_code: '', bedrooms: '', bathrooms: '', surface: '',
      floor: '', has_elevator: false, has_terrace: false, has_garage: false, condition: '',
      description: '', features: '', images: '', public_url: '', status: 'disponible', assigned_to: '',
      office_id: '',
    })
    setAiSnippet('')
    setAiPreviewData(null)
  }

  const openAddModal = (mode) => {
    resetForm()
    setCreateMode(mode || 'manual')
    setShowAddModal(true)
  }

  // Add lead to property interests
  const handleAddInterest = async (leadId, channel) => {
    if (!drawerProperty) return
    try {
      await createPropertyInterest(drawerProperty.id, leadId, channel)
      toast.success('¡Lead añadido a interesados!')
      openDetail(drawerProperty)
    } catch (e) {
      toast.error('Este lead ya está interesado en la propiedad.')
    }
  }

  const handleRemoveInterest = async (interestId) => {
    if (!drawerProperty) return
    try {
      await deletePropertyInterest(drawerProperty.id, interestId)
      toast.success('Interés eliminado.')
      openDetail(drawerProperty)
    } catch {
      toast.error('Error al eliminar interés.')
    }
  }

  // IA Improvements tab
  const handleLoadAIImprovement = async () => {
    if (!drawerProperty) return
    setLoadingImprovement(true)
    setImprovementData(null)
    try {
      const r = await improvePropertyAI(drawerProperty.id)
      setImprovementData(r)
      toast.success('Optimización completada por la IA')
    } catch {
      toast.error('Error al cargar la mejora de IA.')
    } finally {
      setLoadingImprovement(false)
    }
  }

  const handleApplyAIImprovement = async () => {
    if (!drawerProperty || !improvementData) return
    setSaving(true)
    try {
      const after = improvementData.after
      await updateProperty(drawerProperty.id, {
        title: after.title,
        description: after.description,
        price: after.price,
        features: after.features,
      })
      toast.success('¡Mejoras de la IA aplicadas de inmediato!')
      openDetail({ ...drawerProperty, ...after })
    } catch {
      toast.error('Error al aplicar mejoras.')
    } finally {
      setSaving(false)
    }
  }

  // Marketing assets generation
  const handleGenerateMarketing = async (actionType) => {
    if (!drawerProperty) return
    setLoadingMarketing(true)
    setMarketingAssetContent(null)
    setMarketingAssetType(actionType)
    try {
      const r = await generateMarketingAsset(drawerProperty.id, actionType)
      setMarketingAssetContent(r.content)
      toast.success('Asset de marketing generado')
    } catch {
      toast.error('Error al generar asset.')
    } finally {
      setLoadingMarketing(false)
    }
  }

  // Contact triggers
  const triggerWhatsApp = (phone, msg) => {
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
  }
  const triggerEmail = (email, subject, body) => {
    window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank')
  }

  const pImages = drawerProperty && drawerData ? parseImagesProperty(drawerData.images || drawerProperty.images) : []
  const scoreQuality = drawerProperty ? computeQualityScore(drawerProperty) : 0

  const drawerTabs = [
    { id: 'resumen', label: 'Resumen', icon: Eye },
    { id: 'imagenes', label: 'Imágenes', icon: ImageIcon },
    { id: 'interesados', label: 'Interesados', icon: Star },
    { id: 'compatibles', label: 'Compatibles', icon: Target },
    { id: 'actividad', label: 'Actividad', icon: Clock },
    { id: 'marketing', label: 'Marketing', icon: Sparkles },
    { id: 'ia', label: 'Mejora IA', icon: Sparkles },
  ]

  const marketingToolsList = [
    { id: 'idealista_desc', label: 'Descripción Idealista', desc: 'Texto comercial de alto impacto con viñetas' },
    { id: 'fotocasa_desc', label: 'Descripción Fotocasa', desc: 'Redacción orientada a familias y confort' },
    { id: 'whatsapp', label: 'Mensaje WhatsApp', desc: 'Texto con emojis para capturar atención al instante' },
    { id: 'email', label: 'Email Comercial', desc: 'Email de venta formal y estructurado' },
    { id: 'instagram', label: 'Post Instagram', desc: 'Copia inspiradora con hashtags inmobiliarios' },
    { id: 'facebook', label: 'Post Facebook', desc: 'Copia orientada a grupos inmobiliarios locales' },
    { id: 'google_ads', label: 'Anuncio Google Ads', desc: 'Textos cortos de alta conversión y clics' },
    { id: 'title_alternative', label: 'Títulos Alternativos', desc: '5 opciones sugeridas de títulos atractivos' },
    { id: 'summary_short', label: 'Resumen Corto', desc: 'Ficha rápida en menos de 60 palabras' },
    { id: 'pdf_sheet', label: 'Ficha Dossier PDF', desc: 'Texto estructurado para trípticos o dossier de venta' },
    { id: 'analyze_quality', label: 'Análisis Calidad', desc: 'Inspecciona debilidades del anuncio y puntúa' },
    { id: 'suggest_improvements', label: 'Mejoras Home Staging', desc: 'Checklist para vender o alquilar más rápido' },
    { id: 'target_buyer', label: 'Cliente Ideal', desc: 'Estrategia y perfil para captar el target exacto' },
    { id: 'campaign_ideas', label: 'Ideas de Campaña', desc: '3 estrategias creativas online y offline' },
    { id: 'whatsapp_share', label: 'WhatsApp Compartible', desc: 'Mensaje idóneo para compartir en parejas' },
    { id: 'email_compatibles', label: 'Email para Compatibles', desc: 'Email masivo para leads calificados en la zona' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 text-slate-100 min-h-screen pb-12">
      
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between flex-wrap gap-4 p-6 bg-slate-900/60 backdrop-blur border border-slate-800 rounded-3xl shadow-glow">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg">
            <Building2 size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Gestión de Propiedades</h1>
            <p className="text-xs text-slate-400">Administra, importa, optimiza con IA y publica tus inmuebles premium</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por título, ciudad..." className="w-48 lg:w-64 pl-9 pr-4 py-2.5 text-xs bg-slate-950/80 border border-slate-800 rounded-xl focus:border-blue-500/80 transition-all outline-none text-slate-100 placeholder-slate-500 shadow-inner" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={`p-2.5 rounded-xl border text-xs transition-all flex items-center gap-2 ${showFilters || activeFiltersCount > 0 ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'border-slate-800 bg-slate-950/80 text-slate-400 hover:text-slate-200'}`}>
            <Filter size={15} />
            Filtrar
            {activeFiltersCount > 0 && <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-500 text-white rounded-full">{activeFiltersCount}</span>}
          </button>
          <button onClick={() => { setImportMode('url'); setShowImportModal(true) }} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-950/80 text-slate-300 border border-slate-800 rounded-xl hover:bg-slate-900 transition-all text-xs font-semibold"><Download size={14} /> Importar</button>
          <button onClick={() => openAddModal('ai')} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 text-white rounded-xl hover:from-cyan-500 hover:to-indigo-500 transition-all text-xs font-semibold shadow-md shadow-cyan-900/30"><Sparkles size={14} /> Crear con IA</button>
          <button onClick={() => openAddModal('manual')} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-500 hover:to-purple-500 transition-all text-xs font-semibold shadow-md shadow-blue-900/30"><Plus size={14} /> Nueva propiedad</button>
        </div>
      </div>

      {/* ── ADVANCED FILTERS ── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Origen</label>
                <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300"><option value="">Todos</option><option value="manual">Manual</option><option value="idealista">Idealista</option><option value="ia">IA</option></select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Operación</label>
                <select value={operationFilter} onChange={e => setOperationFilter(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300"><option value="">Todas</option><option value="sale">Venta</option><option value="rent">Alquiler</option></select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Tipo</label>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300"><option value="">Todos</option>{typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Estado comercial</label>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300"><option value="">Todos</option><option value="disponible">Disponible</option><option value="reservado">Reservado</option><option value="vendido">Vendido</option><option value="alquilado">Alquilado</option></select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Precio Mínimo (€)</label>
                <input type="number" value={priceMin} onChange={e => setPriceMin(e.target.value)} placeholder="0" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Precio Máximo (€)</label>
                <input type="number" value={priceMax} onChange={e => setPriceMax(e.target.value)} placeholder="9999999" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Habitaciones</label>
                <input type="number" value={bedroomsFilter} onChange={e => setBedroomsFilter(e.target.value)} placeholder="Ej: 3" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Baños</label>
                <input type="number" value={bathroomsFilter} onChange={e => setBathroomsFilter(e.target.value)} placeholder="Ej: 2" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">M2 Mínimo</label>
                <input type="number" value={surfaceMin} onChange={e => setSurfaceMin(e.target.value)} placeholder="Ej: 80" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Ciudad</label>
                <input type="text" value={cityFilter} onChange={e => setCityFilter(e.target.value)} placeholder="Madrid" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Zona</label>
                <input type="text" value={zoneFilter} onChange={e => setZoneFilter(e.target.value)} placeholder="Centro" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 outline-none focus:border-blue-500" />
              </div>
              <div className="flex items-end">
                <button onClick={() => { setTypeFilter(''); setOperationFilter(''); setStatusFilter(''); setPriceMin(''); setPriceMax(''); setBedroomsFilter(''); setBathroomsFilter(''); setSurfaceMin(''); setSourceFilter(''); setCityFilter(''); setZoneFilter(''); setWithPhotos(''); setWithDescription(''); setActiveAlert(null) }} className="w-full py-2 bg-slate-950 border border-slate-800 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-slate-200 transition-colors font-medium">Limpiar Filtros</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── METRICS CLICABLE CARDS ── */}
      {loadingMetrics ? (
        <div className="flex items-center justify-center py-4"><div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>
      ) : metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: 'Total', value: metrics.total, alertId: null, icon: 'Building2' },
            { label: 'Disponibles', value: metrics.disponibles, alertId: null, icon: 'CheckCircle2' },
            { label: 'Reservadas', value: metrics.reservadas, alertId: null, icon: 'Clock' },
            { label: 'Vendidas/Alq.', value: metrics.vendidas, alertId: null, icon: 'Handshake' },
            { label: 'Precio medio', value: formatCurrency(metrics.avgPrice), alertId: null, icon: 'DollarSign' },
            { label: 'Sin fotos', value: metrics.sinFotos, alertId: 'sin_fotos', icon: 'Camera' },
            { label: 'Sin descripción', value: metrics.sinDesc, alertId: 'sin_desc', icon: 'FileText' },
            { label: 'Idealista', value: metrics.importadas, alertId: null, icon: 'Globe' }
          ].map((m, i) => {
            const iconMap = { Building2, CheckCircle2, Clock, Handshake, DollarSign, Camera, FileText, Globe }
            const Icon = iconMap[m.icon] || Globe
            const isAlert = !!m.alertId
            return (
              <div key={i} onClick={() => { if (isAlert) handleAlertClick(m.alertId) }} className={`p-4 border rounded-2xl text-center transition-all shadow-card hover:shadow-glow ${isAlert ? 'border-amber-500/20 hover:bg-amber-500/5 cursor-pointer' : 'border-slate-800/80'}`}>
                <div className={`inline-flex items-center justify-center w-8 h-8 rounded-xl ${isAlert ? 'bg-amber-500/10' : 'bg-slate-800/50'} mb-2`}>
                  <Icon size={14} className={isAlert ? 'text-amber-400' : 'text-slate-400'} />
                </div>
                <p className={`text-xl font-bold font-syne ${isAlert ? 'text-amber-300' : 'text-slate-100'}`}>{m.value}</p>
                <p className="text-[10px] text-slate-500 tracking-wider uppercase mt-1 truncate">{m.label}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* ── QUALITY ALERTS TAGS ── */}
      {qualityAlerts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5"><AlertCircle size={13} className="text-amber-400" /> Alertas de calidad activa:</span>
          {qualityAlerts.map(a => (
            <button key={a.id} onClick={() => handleAlertClick(a.id)} className={`flex items-center gap-1.5 px-3 py-1 bg-slate-900 border rounded-full text-xs font-medium transition-all ${activeAlert === a.id ? 'border-amber-500 text-amber-400 bg-amber-500/10' : 'border-slate-800 text-slate-400 hover:border-slate-700'}`}>
              <a.icon size={12} />
              {a.text}
            </button>
          ))}
          {activeAlert && (
            <button onClick={() => setActiveAlert(null)} className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 rounded-full flex items-center gap-1 transition-all"><X size={11} /> Limpiar Alerta</button>
          )}
        </div>
      )}

      {/* ── TABS NAVIGATION ── */}
      <div className="flex items-center gap-1 bg-slate-900/60 backdrop-blur border border-slate-800/60 p-1.5 rounded-2xl overflow-x-auto shadow-card">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setActiveAlert(null) }} className={`px-5 py-2.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── PROPERTIES GRID ── */}
      {loading.properties && properties.length === 0 ? (
        <div className="flex items-center justify-center min-h-[40vh]"><div className="flex flex-col items-center gap-3"><Loader2 size={32} className="animate-spin text-blue-500" /><p className="text-xs text-slate-400">Cargando propiedades...</p></div></div>
      ) : displayProperties.length === 0 ? (
        <div className="p-16 bg-slate-900/30 border border-slate-800/80 rounded-3xl flex flex-col items-center justify-center text-center max-w-4xl mx-auto shadow-inner">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 flex items-center justify-center mb-5 shadow-lg">
            <Building2 size={36} className="text-slate-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-200 font-syne mb-2">Sin propiedades</h3>
          <p className="text-xs text-slate-500 max-w-sm mb-8 leading-relaxed">No se encontraron propiedades que coincidan con la vista o los filtros actuales.</p>
          <div className="flex items-center gap-3">
            <button onClick={() => { setCreateMode('manual'); setShowAddModal(true) }} className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-blue-500 hover:to-purple-500 hover:shadow-lg transition-all"><Plus size={14} className="inline mr-1.5" /> Nueva propiedad</button>
            <button onClick={() => { setImportMode('url'); setShowImportModal(true) }} className="px-5 py-2.5 bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 rounded-xl text-xs font-semibold text-slate-300 hover:text-slate-100 transition-all"><Download size={14} className="inline mr-1.5" /> Importar desde URL</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <AnimatePresence mode="popLayout">
            {displayProperties.map(property => {
              const TypeIcon = propertyTypeIcons[property.type] || Home
              const imagesList = parseImagesProperty(property.images)
              const score = computeQualityScore(property)
              const portal = property.external_source || property.source || 'manual'
              const isIncomplete = imagesList.length === 0 || !property.description || property.description.trim() === '' || !property.price || property.price === 0 || !property.surface || !property.city

              return (
                <motion.div key={property.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }} initial="hidden" animate="show" exit={{ opacity: 0, scale: 0.95 }} layout onClick={() => openDetail(property)} className="bg-slate-900/60 hover:bg-slate-900/90 border border-slate-800/80 hover:border-blue-500/30 rounded-2xl overflow-hidden shadow-card hover:shadow-glow cursor-pointer transition-all duration-300 group flex flex-col justify-between">
                  <div>
                    {/* Cover image */}
                    <div className="h-48 bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center relative overflow-hidden">
                      {imagesList.length > 0 ? (
                        <>
                          <img src={imagesList[0]} alt={property.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement.innerHTML = `<div class="flex flex-col items-center gap-1.5 opacity-40"><svg class="w-8 h-8 text-slate-400" ...></svg><span class="text-[10px] text-slate-500 uppercase tracking-wider">Sin imagen</span></div>` }} />
                          {/* Gradient overlay at bottom for better badge readability */}
                          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950/80 to-transparent pointer-events-none" />
                          {imagesList.length > 1 && (
                            <div className="absolute top-3 right-3 px-2 py-0.5 bg-slate-950/80 backdrop-blur border border-white/10 rounded-lg text-[9px] font-bold text-white shadow-sm">
                              +{imagesList.length - 1} fotos
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-2 opacity-50">
                          <div className="w-12 h-12 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center">
                            <Camera size={20} className="text-slate-500" />
                          </div>
                          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Sin imagen</span>
                        </div>
                      )}
                      
                      {/* Top badges row */}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold border backdrop-blur-sm shadow-sm ${propertyStatusColors[property.status] || 'bg-slate-950/80 text-slate-400 border-slate-800'}`}>
                          {propertyStatusLabels[property.status] || property.status}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg text-[9px] font-bold border backdrop-blur-sm shadow-sm bg-slate-950/80 text-slate-300 border-slate-800/50">
                          {getOperationLabel(property.operation_type || 'sale')}
                        </span>
                      </div>

                      {/* Quality Score Indicator */}
                      <div className={`absolute top-3 right-3 px-2 py-1 rounded-lg text-[9px] font-bold border backdrop-blur-sm shadow-sm ${imagesList.length > 0 ? '' : ''} ${getQualityColor(score)} z-10`}>
                        {score}%
                      </div>

                      {/* Bottom badges */}
                      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10">
                        <div className="flex items-center gap-1.5">
                          {isIncomplete && (
                            <span className="px-2 py-0.5 bg-rose-500/90 backdrop-blur rounded-lg text-[9px] font-bold text-white border border-rose-600/30 shadow-sm animate-pulse">
                              Incompleta
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border backdrop-blur-sm shadow-sm ${portalColors[portal] || 'bg-slate-950/85 border-slate-800 text-slate-400'}`}>
                            {portalLabels[portal] || portal}
                          </span>
                        </div>
                        {property.created_at && (
                          <span className="text-[9px] text-slate-500 font-medium px-1.5 py-0.5 bg-slate-950/60 rounded-lg backdrop-blur-sm">
                            {formatDate(property.created_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Details body */}
                    <div className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-bold text-slate-100 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-purple-400 group-hover:bg-clip-text transition-all leading-snug line-clamp-1 flex-1">{property.title}</h3>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <MapPin size={11} className="text-slate-500 shrink-0" />
                        <span className="truncate">{property.city}{property.zone ? `, ${property.zone}` : ''}</span>
                      </div>
                      <p className="text-xl font-black text-white flex items-baseline gap-1">
                        {formatCurrency(property.price)}
                        {property.operation_type === 'rent' && <span className="text-xs text-slate-400 font-normal">/mes</span>}
                      </p>

                      {/* Stats list */}
                      <div className="flex items-center gap-4 text-[10px] text-slate-400 pt-2.5 border-t border-slate-800/80">
                        {property.bedrooms > 0 && <span className="flex items-center gap-1.5"><Bed size={12} className="text-blue-400/70" />{property.bedrooms} <span className="hidden sm:inline">hab</span></span>}
                        {property.bathrooms > 0 && <span className="flex items-center gap-1.5"><Bath size={12} className="text-purple-400/70" />{property.bathrooms} <span className="hidden sm:inline">bañ</span></span>}
                        {property.surface > 0 && <span className="flex items-center gap-1.5"><Maximize size={12} className="text-emerald-400/70" />{property.surface} m²</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="p-3 bg-slate-950/40 border-t border-slate-800/50 flex items-center justify-between gap-1">
                    <div className="flex items-center gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(property, e) }} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all" title="Editar"><Edit3 size={13} /></button>
                      <button onClick={(e) => handleDuplicate(property, e)} className="p-1.5 rounded-lg text-slate-400 hover:text-purple-400 hover:bg-purple-500/10 transition-all" title="Duplicar"><Copy size={13} /></button>
                      <button onClick={(e) => handleShare(property, e)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all" title="Compartir enlace"><Share2 size={13} /></button>
                      <button onClick={(e) => { e.stopPropagation(); openDetail(property); setTimeout(() => setDrawerTab('ia'), 100) }} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all" title="Mejorar con IA"><Sparkles size={13} /></button>
                      <button onClick={(e) => { e.stopPropagation(); openDetail(property); setTimeout(() => setDrawerTab('marketing'), 100) }} className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all" title="Marketing"><Target size={13} /></button>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(property) }} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all" title="Eliminar"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ── CREATE / CREATE AI MODAL ── */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-3xl shadow-elevated w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6">
              
              {/* Tab options in Modal header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl">
                  <button onClick={() => setCreateMode('manual')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${createMode === 'manual' ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}><Edit3 size={13} /> Creación Manual</button>
                  <button onClick={() => setCreateMode('ai')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${createMode === 'ai' ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}><Sparkles size={13} /> Añadir con IA</button>
                </div>
                <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-all"><X size={18} /></button>
              </div>

              {createMode === 'manual' ? (
                /* MANUAL FORM */
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="col-span-2 sm:col-span-3"><label className="text-slate-400 block mb-1">Título comercial *</label><input type="text" value={formData.title} onChange={e => setFormData(f => ({ ...f, title: e.target.value }))} placeholder="Ej: Espectacular piso reformado en Salamanca" className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                  <div className="col-span-2 sm:col-span-3"><label className="text-slate-400 block mb-1">Descripción comercial</label><textarea value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} placeholder="Escriba aquí los detalles del anuncio..." rows={3} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none resize-none focus:border-blue-500" /></div>
                  <div><label className="text-slate-400 block mb-1">Precio (€) *</label><input type="number" value={formData.price} onChange={e => setFormData(f => ({ ...f, price: e.target.value }))} placeholder="350000" className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                  <div><label className="text-slate-400 block mb-1">Operación</label><select value={formData.operation_type} onChange={e => setFormData(f => ({ ...f, operation_type: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none text-slate-300"><option value="sale">Venta</option><option value="rent">Alquiler</option></select></div>
                  <div><label className="text-slate-400 block mb-1">Tipo inmueble</label><select value={formData.type} onChange={e => setFormData(f => ({ ...f, type: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none text-slate-300">{typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                  <div><label className="text-slate-400 block mb-1">Ciudad *</label><input type="text" value={formData.city} onChange={e => setFormData(f => ({ ...f, city: e.target.value }))} placeholder="Madrid" className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                  <div><label className="text-slate-400 block mb-1">Zona</label><input type="text" value={formData.zone} onChange={e => setFormData(f => ({ ...f, zone: e.target.value }))} placeholder="Chamberí" className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                  <div><label className="text-slate-400 block mb-1">Dirección</label><input type="text" value={formData.address} onChange={e => setFormData(f => ({ ...f, address: e.target.value }))} placeholder="Calle Almagro 14" className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                  <div><label className="text-slate-400 block mb-1">Provincia</label><input type="text" value={formData.province} onChange={e => setFormData(f => ({ ...f, province: e.target.value }))} placeholder="Madrid" className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                  <div><label className="text-slate-400 block mb-1">Código Postal</label><input type="text" value={formData.postal_code} onChange={e => setFormData(f => ({ ...f, postal_code: e.target.value }))} placeholder="28010" className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                  <div><label className="text-slate-400 block mb-1">Estado de conservación</label><select value={formData.condition} onChange={e => setFormData(f => ({ ...f, condition: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none text-slate-300">{conditionOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                  <div><label className="text-slate-400 block mb-1">Habitaciones</label><input type="number" value={formData.bedrooms} onChange={e => setFormData(f => ({ ...f, bedrooms: e.target.value }))} placeholder="3" className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                  <div><label className="text-slate-400 block mb-1">Baños</label><input type="number" value={formData.bathrooms} onChange={e => setFormData(f => ({ ...f, bathrooms: e.target.value }))} placeholder="2" className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                  <div><label className="text-slate-400 block mb-1">Superficie (m²)</label><input type="number" value={formData.surface} onChange={e => setFormData(f => ({ ...f, surface: e.target.value }))} placeholder="110" className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                  <div><label className="text-slate-400 block mb-1">Planta</label><input type="text" value={formData.floor} onChange={e => setFormData(f => ({ ...f, floor: e.target.value }))} placeholder="4ª" className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                  <div><label className="text-slate-400 block mb-1">Estado Comercial</label><select value={formData.status} onChange={e => setFormData(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none text-slate-300"><option value="disponible">Disponible</option><option value="reservado">Reservado</option><option value="vendido">Vendido</option><option value="alquilado">Alquilado</option></select></div>
                  <div><label className="text-slate-400 block mb-1">Comercial asignado</label><select value={formData.assigned_to} onChange={e => setFormData(f => ({ ...f, assigned_to: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none text-slate-300"><option value="">Ninguno</option>{commercialAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                  <div className="flex items-center gap-4 col-span-2 pt-2">
                    {[{ key: 'has_elevator', label: 'Ascensor' }, { key: 'has_terrace', label: 'Terraza' }, { key: 'has_garage', label: 'Garaje' }].map(b => (
                      <label key={b.key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={formData[b.key]} onChange={e => setFormData(f => ({ ...f, [b.key]: e.target.checked }))} className="w-4 h-4 bg-slate-950 border-slate-800 rounded text-blue-500 focus:ring-0 focus:ring-offset-0" />
                        <span className="text-slate-300 font-semibold">{b.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="col-span-2 sm:col-span-3"><label className="text-slate-400 block mb-1">Características destacadas (separar por comas)</label><input type="text" value={formData.features} onChange={e => setFormData(f => ({ ...f, features: e.target.value }))} placeholder="Calefacción individual, Armarios empotrados, Muy luminoso" className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                  <div className="col-span-2 sm:col-span-3"><label className="text-slate-400 block mb-1">Imágenes del inmueble (URLs de imágenes separadas por comas)</label><input type="text" value={formData.images} onChange={e => setFormData(f => ({ ...f, images: e.target.value }))} placeholder="https://miweb.com/foto1.jpg, https://miweb.com/foto2.jpg" className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                  <div className="col-span-2 sm:col-span-3"><label className="text-slate-400 block mb-1">URL pública si existe</label><input type="url" value={formData.public_url} onChange={e => setFormData(f => ({ ...f, public_url: e.target.value }))} placeholder="https://www.idealista.com/inmueble/..." className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                  
                  <div className="col-span-2 sm:col-span-3 flex items-center gap-3 mt-6 border-t border-slate-800 pt-4">
                    <button onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2.5 font-bold text-slate-400 hover:text-slate-200 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all">Cancelar</button>
                    <button onClick={handleAddProperty} disabled={saving} className="flex-1 px-4 py-2.5 font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl transition-all shadow-md flex items-center justify-center gap-2">
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      {saving ? 'Guardando...' : 'Crear Propiedad'}
                    </button>
                  </div>
                </div>
              ) : (
                /* CREATION WITH IA */
                <div className="space-y-4 text-xs">
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                    <h4 className="font-bold text-slate-200 flex items-center gap-1.5"><Sparkles size={14} className="text-cyan-400" /> Redactor Inmobiliario Inteligente</h4>
                    <p className="text-slate-400 text-[11px]">Escriba una descripción corta o suelta y la IA generará el anuncio completo pulido, los textos para redes, email, WhatsApp y la ficha estructurada lista para publicar en el CRM.</p>
                  </div>
                  {!aiPreviewData ? (
                    <div>
                      <label className="text-slate-400 block mb-1">Inserte descripción o datos rápidos del inmueble</label>
                      <textarea value={aiSnippet} onChange={e => setAiSnippet(e.target.value)} placeholder="Ej: Piso en Madrid centro, 3 habitaciones, 2 baños, terraza, 120m2, 385000 euros, ideal para familia..." rows={6} className="w-full px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-800 rounded-xl outline-none resize-none focus:border-blue-500 text-slate-100 placeholder-slate-600 leading-relaxed font-syne" />
                      <button onClick={handleCreateAI} disabled={aiGenerating || !aiSnippet.trim()} className="w-full mt-3 py-3 font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl transition-all shadow flex items-center justify-center gap-2 disabled:opacity-50">
                        {aiGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        {aiGenerating ? 'Procesando con IA...' : 'Generar ficha de anuncio'}
                      </button>
                    </div>
                  ) : (
                    /* AI STRUCTURED PREVIEW */
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                        <h4 className="font-bold text-slate-200 flex items-center justify-between">
                          <span>Vista previa del anuncio generado</span>
                          <span className="text-[10px] text-cyan-400 font-bold bg-cyan-950 px-2 py-0.5 border border-cyan-850 rounded">IA LISTO</span>
                        </h4>
                        
                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                          <div><label className="text-slate-400 block">Título comercial</label><input type="text" value={aiPreviewData.fields.title} onChange={e => setAiPreviewData(prev => ({ ...prev, fields: { ...prev.fields, title: e.target.value } }))} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-200" /></div>
                          <div><label className="text-slate-400 block">Precio (€)</label><input type="number" value={aiPreviewData.fields.price} onChange={e => setAiPreviewData(prev => ({ ...prev, fields: { ...prev.fields, price: Number(e.target.value) } }))} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-200" /></div>
                          <div><label className="text-slate-400 block">Ciudad</label><input type="text" value={aiPreviewData.fields.city} onChange={e => setAiPreviewData(prev => ({ ...prev, fields: { ...prev.fields, city: e.target.value } }))} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-200" /></div>
                          <div><label className="text-slate-400 block">Zona</label><input type="text" value={aiPreviewData.fields.zone} onChange={e => setAiPreviewData(prev => ({ ...prev, fields: { ...prev.fields, zone: e.target.value } }))} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-200" /></div>
                          <div><label className="text-slate-400 block">Habitaciones</label><input type="number" value={aiPreviewData.fields.bedrooms} onChange={e => setAiPreviewData(prev => ({ ...prev, fields: { ...prev.fields, bedrooms: Number(e.target.value) } }))} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-200" /></div>
                          <div><label className="text-slate-400 block">Baños</label><input type="number" value={aiPreviewData.fields.bathrooms} onChange={e => setAiPreviewData(prev => ({ ...prev, fields: { ...prev.fields, bathrooms: Number(e.target.value) } }))} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-200" /></div>
                          <div><label className="text-slate-400 block">Superficie (m²)</label><input type="number" value={aiPreviewData.fields.surface} onChange={e => setAiPreviewData(prev => ({ ...prev, fields: { ...prev.fields, surface: Number(e.target.value) } }))} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-200" /></div>
                          <div><label className="text-slate-400 block">Operación</label><select value={aiPreviewData.fields.operation_type} onChange={e => setAiPreviewData(prev => ({ ...prev, fields: { ...prev.fields, operation_type: e.target.value } }))} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-200"><option value="sale">Venta</option><option value="rent">Alquiler</option></select></div>
                        </div>

                        <div><label className="text-slate-400 block">Descripción comercial de la IA</label><textarea value={aiPreviewData.fields.description} onChange={e => setAiPreviewData(prev => ({ ...prev, fields: { ...prev.fields, description: e.target.value } }))} rows={4} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-200 resize-none" /></div>
                      </div>

                      {/* Generated Marketing assets tab visual block */}
                      {aiPreviewData.marketing && (
                        <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                          <h4 className="font-bold text-slate-200 flex items-center gap-1.5"><Send size={12} className="text-purple-400" /> WhatsApp & Redes listos</h4>
                          <p className="text-[11px] text-slate-400 truncate">WhatsApp: "{aiPreviewData.marketing.whatsapp?.substring(0, 80)}..."</p>
                          <p className="text-[11px] text-slate-400 truncate">Público: {aiPreviewData.marketing.publico_objetivo}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        <button onClick={() => setAiPreviewData(null)} className="flex-1 py-2.5 font-bold text-slate-400 hover:text-slate-200 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all">Re-escribir / Atrás</button>
                        <button onClick={handleSaveAICreated} disabled={saving} className="flex-1 py-2.5 font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl transition-all shadow-md flex items-center justify-center gap-2">
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                          {saving ? 'Guardando en CRM...' : 'Confirmar e Integrar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── IMPORT URL / CSV MODAL ── */}
      <AnimatePresence>
        {showImportModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!importResults) setShowImportModal(false) }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-3xl shadow-elevated w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
              
              {importResults ? (
                /* IMPORT RESULTS PANEL */
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h2 className="text-lg font-bold font-syne text-ink">Resumen de Importación</h2>
                    <button onClick={handleImportDone} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"><X size={18} /></button>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                      <CheckCircle2 size={24} className="text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-slate-200">{importResults.created?.length || 0} Creadas con Éxito</p>
                        <p className="text-xs text-slate-400">Listas para su visualización y comercialización.</p>
                      </div>
                    </div>

                    {importResults.duplicates?.length > 0 && (
                      <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                        <AlertCircle size={24} className="text-amber-400 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-slate-200">{importResults.duplicates.length} Duplicadas Omitidas</p>
                          <p className="text-xs text-slate-400">Ya existían fichas con la misma URL externa.</p>
                        </div>
                      </div>
                    )}

                    {importResults.errors?.length > 0 && (
                      <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl space-y-2">
                        <p className="text-sm font-semibold text-rose-400 flex items-center gap-2"><AlertCircle size={18} /> {importResults.errors.length} Errores encontrados</p>
                        <div className="max-h-24 overflow-y-auto space-y-1">
                          {importResults.errors.slice(0, 5).map((err, i) => (
                            <p key={i} className="text-[11px] text-slate-400 font-mono ml-6 truncate">{err.url || `Fila ${err.row || i+1}`}: {err.error || err}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button onClick={handleImportDone} className="w-full py-2.5 font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl transition-all shadow-md">Finalizar y Ver Listado</button>
                </div>
              ) : (
                /* IMPORT INPUT PANEL */
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h2 className="text-lg font-bold font-syne text-ink">Importar Inmuebles</h2>
                    <button onClick={() => setShowImportModal(false)} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"><X size={18} /></button>
                  </div>
                  
                  <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl">
                    <button onClick={() => setImportMode('url')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${importMode === 'url' ? 'bg-slate-900 border border-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}><LinkIcon size={12} /> URLs de Portales</button>
                    <button onClick={() => setImportMode('csv')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${importMode === 'csv' ? 'bg-slate-900 border border-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}><FileSpreadsheet size={12} /> Archivo CSV / Pegar</button>
                  </div>

                  {importMode === 'url' ? (
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="text-slate-400 block mb-1.5">Pegue las URLs de los anuncios (uno por línea)</label>
                        <textarea value={importUrls} onChange={e => setImportUrls(e.target.value)} placeholder="https://www.idealista.com/inmueble/105492934/&#10;https://www.fotocasa.es/es/ad/182940294/&#10;https://www.habitaclia.com/comprar-piso-barcelona..." rows={6} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none resize-none font-mono text-[11px] leading-relaxed text-slate-200 focus:border-blue-500" />
                        <p className="text-[10px] text-slate-500 mt-1">Detección automática de Idealista, Fotocasa, Habitaclia y Pisos.com. Si el portal tiene bloqueos anti-scrapers, crearemos una ficha preliminar con la URL para llenarla manualmente.</p>
                      </div>
                      {importUrls.trim() && (() => {
                        const urls = importUrls.split('\n').map(u => u.trim()).filter(Boolean)
                        const portals = urls.map(u => detectPortal(u) || 'otro')
                        const unique = new Set(portals)
                        return (
                          <div className="flex flex-wrap gap-1.5 pt-1.5">
                            {[...unique].map(p => (
                              <span key={p} className={`px-2.5 py-0.5 text-[9px] font-bold rounded-full border ${portalColors[p] || 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                                {portalLabels[p] || p} ({portals.filter(x => x === p).length})
                              </span>
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="text-slate-400 block mb-1.5">Pegue el contenido en formato CSV (con cabeceras)</label>
                        <textarea value={importCsvInput} onChange={e => { setImportCsvInput(e.target.value); setCsvPreview(null) }} placeholder="title,description,price,operation_type,type,city,zone,address,bedrooms,bathrooms,surface,images,external_url&#10;&quot;Piso moderno en Chamartín&quot;,&quot;Precioso piso exterior...&quot;,450000,sale,apartment,Madrid,Chamartín,&quot;Paseo de la Castellana&quot;,3,2,110,&quot;url1.jpg,url2.jpg&quot;,https://..." rows={6} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none resize-none font-mono text-[10px] leading-relaxed text-slate-200 focus:border-blue-500" />
                      </div>
                      {importCsvInput.trim() && !csvPreview && (
                        <button onClick={handleCsvPreview} className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"><Eye size={12} /> Cargar vista previa estructurada</button>
                      )}
                      {csvPreview && (
                        <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 max-h-40 overflow-auto">
                          <p className="text-[10px] font-bold text-slate-400 mb-1.5">Previsualización de datos ({csvPreview.preview_count} de {csvPreview.total} filas)</p>
                          <table className="w-full text-[10px] text-left border-collapse">
                            <thead>
                              <tr className="text-slate-500 border-b border-slate-800">
                                {csvPreview.headers.slice(0, 5).map((h, i) => <th key={i} className="pb-1 font-bold truncate max-w-[90px]">{h}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {csvPreview.rows.map((row, i) => (
                                <tr key={i} className="border-b border-slate-900/50 hover:bg-slate-900/40">
                                  {csvPreview.headers.slice(0, 5).map((h, j) => <td key={j} className="py-1 text-slate-300 truncate max-w-[90px]">{row[h] || '—'}</td>)}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-6 border-t border-slate-800 pt-4">
                    <button onClick={() => setShowImportModal(false)} className="flex-1 py-2.5 font-bold text-slate-400 hover:text-slate-200 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all">Cancelar</button>
                    <button onClick={handleImport} disabled={importing || (importMode === 'url' ? !importUrls.trim() : !importCsvInput.trim())} className="flex-1 py-2.5 font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl transition-all shadow-md flex items-center justify-center gap-2">
                      {importing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                      {importing ? 'Procesando...' : 'Iniciar Importación'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── EDIT PROPERTY MODAL ── */}
      <AnimatePresence>
        {showEditModal && editingProperty && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowEditModal(false); setEditingProperty(null) }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-3xl shadow-elevated w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6">
              
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-5">
                <h2 className="text-lg font-bold font-syne text-ink flex items-center gap-2"><Edit3 size={18} className="text-blue-500" /> Editar Propiedad</h2>
                <button onClick={() => { setShowEditModal(false); setEditingProperty(null) }} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"><X size={18} /></button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="col-span-2 sm:col-span-3"><label className="text-slate-400 block mb-1">Título comercial *</label><input type="text" value={formData.title} onChange={e => setFormData(f => ({ ...f, title: e.target.value }))} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                <div className="col-span-2 sm:col-span-3"><label className="text-slate-400 block mb-1">Descripción comercial</label><textarea value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none resize-none focus:border-blue-500" /></div>
                <div><label className="text-slate-400 block mb-1">Precio (€) *</label><input type="number" value={formData.price} onChange={e => setFormData(f => ({ ...f, price: e.target.value }))} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                <div><label className="text-slate-400 block mb-1">Operación</label><select value={formData.operation_type} onChange={e => setFormData(f => ({ ...f, operation_type: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none text-slate-300"><option value="sale">Venta</option><option value="rent">Alquiler</option></select></div>
                <div><label className="text-slate-400 block mb-1">Tipo inmueble</label><select value={formData.type} onChange={e => setFormData(f => ({ ...f, type: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none text-slate-300">{typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                <div><label className="text-slate-400 block mb-1">Ciudad *</label><input type="text" value={formData.city} onChange={e => setFormData(f => ({ ...f, city: e.target.value }))} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                <div><label className="text-slate-400 block mb-1">Zona</label><input type="text" value={formData.zone} onChange={e => setFormData(f => ({ ...f, zone: e.target.value }))} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                <div><label className="text-slate-400 block mb-1">Dirección</label><input type="text" value={formData.address} onChange={e => setFormData(f => ({ ...f, address: e.target.value }))} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                <div><label className="text-slate-400 block mb-1">Provincia</label><input type="text" value={formData.province} onChange={e => setFormData(f => ({ ...f, province: e.target.value }))} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                <div><label className="text-slate-400 block mb-1">CP</label><input type="text" value={formData.postal_code} onChange={e => setFormData(f => ({ ...f, postal_code: e.target.value }))} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                <div><label className="text-slate-400 block mb-1">Estado de conservación</label><select value={formData.condition} onChange={e => setFormData(f => ({ ...f, condition: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none text-slate-300">{conditionOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                <div><label className="text-slate-400 block mb-1">Habitaciones</label><input type="number" value={formData.bedrooms} onChange={e => setFormData(f => ({ ...f, bedrooms: e.target.value }))} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                <div><label className="text-slate-400 block mb-1">Baños</label><input type="number" value={formData.bathrooms} onChange={e => setFormData(f => ({ ...f, bathrooms: e.target.value }))} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                <div><label className="text-slate-400 block mb-1">Superficie (m²)</label><input type="number" value={formData.surface} onChange={e => setFormData(f => ({ ...f, surface: e.target.value }))} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                <div><label className="text-slate-400 block mb-1">Planta</label><input type="text" value={formData.floor} onChange={e => setFormData(f => ({ ...f, floor: e.target.value }))} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                <div><label className="text-slate-400 block mb-1">Estado Comercial</label><select value={formData.status} onChange={e => setFormData(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none text-slate-300"><option value="disponible">Disponible</option><option value="reservado">Reservado</option><option value="vendido">Vendido</option><option value="alquilado">Alquilado</option></select></div>
                <div><label className="text-slate-400 block mb-1">Comercial asignado</label><select value={formData.assigned_to} onChange={e => setFormData(f => ({ ...f, assigned_to: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none text-slate-300"><option value="">Ninguno</option>{commercialAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                <div className="flex items-center gap-4 col-span-2 pt-2">
                  {[{ key: 'has_elevator', label: 'Ascensor' }, { key: 'has_terrace', label: 'Terraza' }, { key: 'has_garage', label: 'Garaje' }].map(b => (
                    <label key={b.key} className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={formData[b.key]} onChange={e => setFormData(f => ({ ...f, [b.key]: e.target.checked }))} className="w-4 h-4 bg-slate-950 border-slate-800 rounded text-blue-500 focus:ring-0 focus:ring-offset-0" />
                      <span className="text-slate-300 font-semibold">{b.label}</span>
                    </label>
                  ))}
                </div>
                <div className="col-span-2 sm:col-span-3"><label className="text-slate-400 block mb-1">Características destacadas (separar por comas)</label><input type="text" value={formData.features} onChange={e => setFormData(f => ({ ...f, features: e.target.value }))} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                <div className="col-span-2 sm:col-span-3"><label className="text-slate-400 block mb-1">Imágenes del inmueble (URLs de imágenes separadas por comas)</label><input type="text" value={formData.images} onChange={e => setFormData(f => ({ ...f, images: e.target.value }))} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
                <div className="col-span-2 sm:col-span-3"><label className="text-slate-400 block mb-1">URL pública si existe</label><input type="url" value={formData.public_url} onChange={e => setFormData(f => ({ ...f, public_url: e.target.value }))} className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-blue-500" /></div>
              </div>

              <div className="flex items-center gap-3 mt-6 border-t border-slate-800 pt-4 text-xs">
                <button onClick={() => { setShowEditModal(false); setEditingProperty(null) }} className="flex-1 py-2.5 font-bold text-slate-400 hover:text-slate-200 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all">Cancelar</button>
                <button onClick={handleEditProperty} disabled={saving} className="flex-1 py-2.5 font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl transition-all shadow-md flex items-center justify-center gap-2">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DELETE CONFIRMATION MODAL ── */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-850 rounded-2xl shadow-elevated w-full max-w-sm p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4"><AlertCircle size={28} className="text-rose-400" /></div>
              <h3 className="text-md font-bold text-slate-100 font-syne mb-1">¿Eliminar esta propiedad?</h3>
              <p className="text-xs text-slate-400 mb-6">Se eliminará <strong>{showDeleteConfirm.title}</strong> de forma irreversible del CRM.</p>
              <div className="flex items-center gap-3 text-xs">
                <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition-all font-semibold">Cancelar</button>
                <button onClick={() => handleDelete(showDeleteConfirm)} className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-white transition-all font-semibold shadow-md shadow-rose-900/20">Eliminar permanentemente</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════════════════════════
           7-TAB ADVANCED DRAWER LATERAL
           ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {drawerProperty && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-end" onClick={() => { setDrawerProperty(null); setDrawerData(null) }}>
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 26, stiffness: 280 }} onClick={e => e.stopPropagation()} className="bg-slate-900 border-l border-slate-800/80 w-full max-w-2xl h-full overflow-y-auto shadow-2xl flex flex-col justify-between text-xs">
              
              <div>
                {/* Header */}
                <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800/80 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <button onClick={() => { setDrawerProperty(null); setDrawerData(null) }} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-850 transition-all shrink-0"><ChevronRight size={18} /></button>
                    <h2 className="text-base font-bold font-syne text-slate-100 truncate">{drawerProperty.title}</h2>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(drawerProperty, e) }} className="p-2 rounded-xl text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all"><Edit3 size={15} /></button>
                    <button onClick={(e) => handleDuplicate(drawerProperty, e)} className="p-2 rounded-xl text-slate-400 hover:text-purple-400 hover:bg-purple-500/10 transition-all"><Copy size={15} /></button>
                    <button onClick={() => setShowDeleteConfirm(drawerProperty)} className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"><Trash2 size={15} /></button>
                  </div>
                </div>

                {/* Navigation 7 tabs */}
                <div className="flex items-center gap-1 bg-slate-950 border-b border-slate-850 px-4 overflow-x-auto shrink-0 sticky top-[57px] z-10">
                  {drawerTabs.map(tab => (
                    <button key={tab.id} onClick={() => setDrawerTab(tab.id)} className={`flex items-center gap-1.5 px-3 py-3 text-[11px] font-bold whitespace-nowrap border-b-2 transition-all ${drawerTab === tab.id ? 'border-blue-500 text-blue-400 bg-slate-900/20' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                      <tab.icon size={13} />
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Drawer Content tabs */}
                {loadingDrawer ? (
                  <div className="flex items-center justify-center py-24"><div className="flex flex-col items-center gap-2"><Loader2 size={24} className="animate-spin text-blue-500" /><span className="text-slate-500 text-[10px]">Cargando expediente...</span></div></div>
                ) : (
                  <div className="p-5">
                    
                    {/* TAB 1: RESUMEN */}
                    {drawerTab === 'resumen' && (
                      <div className="space-y-4">
                        {/* Interactive Gallery */}
                        <div className="relative">
                          {pImages.length > 0 ? (
                            <div className="relative overflow-hidden rounded-2xl border border-slate-800">
                              <img src={pImages[galleryIdx]} alt={`${drawerProperty.title} - ${galleryIdx + 1}`} className="w-full h-64 object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                              {pImages.length > 1 && (
                                <>
                                  <button onClick={() => setGalleryIdx(i => (i - 1 + pImages.length) % pImages.length)} className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-slate-950/80 hover:bg-slate-900 rounded-full text-white border border-slate-800 transition-all"><ChevronLeft size={16} /></button>
                                  <button onClick={() => setGalleryIdx(i => (i + 1) % pImages.length)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-slate-950/80 hover:bg-slate-900 rounded-full text-white border border-slate-800 transition-all"><ChevronRight size={16} /></button>
                                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 p-1.5 bg-slate-950/70 backdrop-blur rounded-full">
                                    {pImages.map((_, i) => (
                                      <button key={i} onClick={() => setGalleryIdx(i)} className={`w-1.5 h-1.5 rounded-full transition-all ${i === galleryIdx ? 'bg-white scale-110' : 'bg-white/40'}`} />
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="h-44 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col items-center justify-center opacity-40 gap-2"><ImageIcon size={44} className="text-slate-400" /><span className="text-[10px] font-bold">Sin galería fotográfica</span></div>
                          )}
                          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                            <span className={`px-2.5 py-1 bg-slate-950/90 border rounded-lg font-bold backdrop-blur text-[10px] ${propertyStatusColors[drawerProperty.status] || ''}`}>{propertyStatusLabels[drawerProperty.status] || drawerProperty.status}</span>
                            <span className="px-2.5 py-1 bg-slate-950/90 border border-slate-800 text-slate-300 rounded-lg font-bold backdrop-blur text-[10px]">{getOperationLabel(drawerProperty.operation_type || 'sale')}</span>
                          </div>
                        </div>

                        {/* Price & Stats Grid */}
                        <div className="grid grid-cols-4 gap-3 p-4 bg-slate-950/60 border border-slate-850 rounded-2xl text-center">
                          <div><p className="text-base font-black text-white">{formatCurrency(drawerProperty.price)}</p><p className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Precio</p></div>
                          <div><p className="text-sm font-bold text-slate-200">{drawerProperty.bedrooms || '0'}</p><p className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Habitaciones</p></div>
                          <div><p className="text-sm font-bold text-slate-200">{drawerProperty.bathrooms || '0'}</p><p className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Baños</p></div>
                          <div><p className="text-sm font-bold text-slate-200">{drawerProperty.surface || '0'} m²</p><p className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Superficie</p></div>
                        </div>

                        {/* Location */}
                        <div className="flex items-start gap-2 p-3 bg-slate-900 border border-slate-800 rounded-xl">
                          <MapPin size={14} className="text-slate-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-semibold text-slate-200">{drawerProperty.city}{drawerProperty.zone ? `, ${drawerProperty.zone}` : ''}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{drawerProperty.address || 'Sin dirección exacta publicada'} {drawerProperty.postal_code ? `(${drawerProperty.postal_code})` : ''}</p>
                          </div>
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Descripción comercial</h4>
                          <p className="text-slate-200 leading-relaxed bg-slate-950/40 p-4 border border-slate-850 rounded-2xl whitespace-pre-wrap">{drawerProperty.description || 'La propiedad no posee una descripción cargada. Genera una automáticamente con IA en la pestaña Marketing.'}</p>
                        </div>

                        {/* Features tags list */}
                        {drawerProperty.features && (() => {
                          const feats = parseFeaturesList(drawerProperty.features)
                          if (feats.length === 0) return null
                          return (
                            <div className="space-y-1.5">
                              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Características</h4>
                              <div className="flex flex-wrap gap-1.5">
                                {feats.map((f, i) => <span key={i} className="px-2.5 py-1 bg-slate-950 border border-slate-850 text-slate-300 rounded-lg">{f}</span>)}
                              </div>
                            </div>
                          )
                        })()}

                        {/* Quality & Checklist */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="p-3 bg-slate-950/40 border border-slate-850 rounded-xl flex items-center justify-between">
                            <span className="text-slate-400">Score de calidad:</span>
                            <span className={`px-2.5 py-0.5 rounded border text-[11px] font-bold ${getQualityColor(scoreQuality)}`}>{scoreQuality}%</span>
                          </div>
                          <div className="p-3 bg-slate-950/40 border border-slate-850 rounded-xl flex items-center justify-between">
                            <span className="text-slate-400">Portal / Origen:</span>
                            <span className="text-slate-300 font-bold capitalize">{drawerProperty.external_source || drawerProperty.source || 'manual'}</span>
                          </div>
                        </div>

                        {/* Alertas list */}
                        {(() => {
                          const alerts = []
                          if (pImages.length === 0) alerts.push('Sin fotos publicadas')
                          if (!drawerProperty.description || drawerProperty.description.trim() === '') alerts.push('Falta descripción comercial')
                          if (!drawerProperty.price) alerts.push('No se ha asignado precio')
                          if (!drawerProperty.surface) alerts.push('No se han asignado m2')
                          if (!drawerProperty.city) alerts.push('Ubicación de ciudad incompleta')
                          if (alerts.length === 0) return null
                          return (
                            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl space-y-1.5">
                              <p className="font-bold flex items-center gap-1.5 text-[11px]"><AlertCircle size={13} /> Alertas del anuncio pendientes:</p>
                              {alerts.map((al, idx) => <p key={idx} className="text-[10px] ml-5">• {al}</p>)}
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {/* TAB 2: IMAGENES */}
                    {drawerTab === 'imagenes' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between bg-slate-950 p-4 border border-slate-850 rounded-2xl">
                          <div>
                            <h4 className="font-bold text-slate-200">Galería de imágenes ({pImages.length})</h4>
                            <p className="text-[10px] text-slate-400 mt-0.5">Establece la foto principal de portada o añade nuevas URLs</p>
                          </div>
                        </div>

                        {pImages.length === 0 ? (
                          <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">Esta ficha no posee imágenes cargadas. Añada URLs abajo.</div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2.5">
                            {pImages.map((img, i) => (
                              <div key={i} className={`relative rounded-xl overflow-hidden border-2 bg-slate-950 group/img ${i === galleryIdx ? 'border-blue-500' : 'border-slate-800'}`}>
                                <img src={img} alt="Imágenes" className="w-full h-24 object-cover cursor-pointer" onClick={() => setGalleryIdx(i)} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                {i === galleryIdx && <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-blue-600 text-[8px] font-bold rounded">Portada</div>}
                                <button onClick={() => {
                                  const updated = pImages.filter((_, idx) => idx !== i)
                                  updateProperty(drawerProperty.id, { images: updated })
                                  toast.success('Imagen eliminada de la ficha')
                                  openDetail(drawerProperty)
                                }} className="absolute bottom-1 right-1 p-1 bg-slate-950/80 hover:bg-rose-600 rounded text-slate-300 hover:text-white opacity-0 group-hover/img:opacity-100 transition-opacity"><Trash2 size={11} /></button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-2xl space-y-2 pt-3">
                          <h4 className="font-bold text-slate-300">Añadir nueva imagen por URL</h4>
                          <div className="flex gap-2">
                            <input type="url" id="new_image_url" placeholder="https://ejemplo.com/mifoto.jpg" className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500" />
                            <button onClick={() => {
                              const input = document.getElementById('new_image_url')
                              if (input && input.value.trim()) {
                                const list = [...pImages, input.value.trim()]
                                updateProperty(drawerProperty.id, { images: list })
                                input.value = ''
                                toast.success('Nueva imagen añadida')
                                openDetail(drawerProperty)
                              }
                            }} className="px-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg text-white font-bold hover:from-blue-500 hover:to-purple-500">Añadir</button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 3: INTERESADOS */}
                    {drawerTab === 'interesados' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-slate-200">Leads que han mostrado interés</h4>
                          <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-bold">{drawerData?.interests?.length || 0} leads</span>
                        </div>

                        {(!drawerData?.interests || drawerData.interests.length === 0) ? (
                          <div className="p-8 text-center text-slate-500 border border-slate-800 rounded-2xl">Aún no hay leads registrados como interesados en este anuncio. Puedes vincular leads calificados en la pestaña Compatibles.</div>
                        ) : (
                          drawerData.interests.map(lead => (
                            <div key={lead.id} className="bg-slate-950/40 border border-slate-850 p-3.5 rounded-2xl flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center font-bold text-xs shrink-0">{getInitials(lead.lead_name)}</div>
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-200 truncate">{lead.lead_name}</p>
                                  <p className="text-[10px] text-slate-400 truncate mt-0.5">{lead.lead_phone || lead.lead_email}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {lead.lead_phone && <button onClick={() => triggerWhatsApp(lead.lead_phone, `Hola ${lead.lead_name}, soy el asistente de la agencia. Nos consta que estás interesado en la propiedad "${drawerProperty.title}" en ${drawerProperty.city}. ¿Te gustaría que organicemos una visita?`)} className="p-2 rounded-lg text-emerald-400 hover:bg-emerald-500/10" title="WhatsApp"><MessageCircle size={15} /></button>}
                                {lead.lead_phone && <button onClick={() => window.open(`tel:${lead.lead_phone}`)} className="p-2 rounded-lg text-blue-400 hover:bg-blue-500/10" title="Llamar"><Phone size={15} /></button>}
                                <button onClick={() => handleRemoveInterest(lead.id)} className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10" title="Eliminar"><X size={15} /></button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* TAB 4: LEADS COMPATIBLES */}
                    {drawerTab === 'compatibles' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-slate-200">Sugerencias de matching inteligente</h4>
                          <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] font-bold">{drawerData?.compatible_leads?.length || 0} compatibles</span>
                        </div>

                        {(!drawerData?.compatible_leads || drawerData.compatible_leads.length === 0) ? (
                          <div className="p-8 text-center text-slate-500 border border-slate-800 rounded-2xl">No se encontraron leads compatibles en el CRM para los filtros de zona, presupuesto y tipología de esta propiedad.</div>
                        ) : (
                          drawerData.compatible_leads.map(lead => {
                            const isAlreadyInter = drawerData.interests?.some(i => i.lead_id === lead.id)
                            return (
                              <div key={lead.id} className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs">{getInitials(lead.name)}</div>
                                    <div>
                                      <p className="font-bold text-slate-200">{lead.name}</p>
                                      <p className="text-[10px] text-slate-400 mt-0.5">Presupuesto máx: {formatCurrency(lead.budget || lead.budget_max || 0)}</p>
                                    </div>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${lead.match_score >= 80 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>Match: {Math.round(lead.match_score || lead.ia_score || 82)}%</span>
                                </div>
                                <p className="text-[10px] text-slate-400 leading-relaxed bg-slate-950/50 p-2.5 rounded-lg border border-slate-900">{lead.match_reason || 'Compatibilidad alta debido a la coincidencia de zona en Chamartín y presupuesto dentro del margen admitido.'}</p>
                                <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-[10px]">
                                  <div className="flex gap-2">
                                    {!isAlreadyInter && (
                                      <button onClick={() => handleAddInterest(lead.id, 'match_sugerido')} className="font-bold text-blue-400 hover:underline flex items-center gap-1"><Star size={11} /> Añadir a Interesados</button>
                                    )}
                                    <button onClick={() => {
                                      triggerWhatsApp(lead.phone || '', `Hola ${lead.name}, te presento esta joya en primicia que encaja con tus búsquedas: ${drawerProperty.title} por ${formatCurrency(drawerProperty.price)}. ¡Dime si quieres visitarla!`)
                                      toast.success('Propiedad enviada al lead')
                                    }} className="font-bold text-emerald-400 hover:underline flex items-center gap-1"><Send size={11} /> Enviar Propiedad</button>
                                  </div>
                                  <a href={`/leads/${lead.id}`} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-200">Ver Ficha Lead →</a>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}

                    {/* TAB 5: ACTIVIDAD */}
                    {drawerTab === 'actividad' && (
                      <div className="space-y-3">
                        <h4 className="font-bold text-slate-200">Historial de logs del inmueble</h4>
                        
                        {(!drawerData?.activities || drawerData.activities.length === 0) ? (
                          <div className="p-8 text-center text-slate-500 border border-slate-800 rounded-2xl">Aún no se ha registrado ninguna actividad comercial para esta ficha.</div>
                        ) : (
                          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                            {drawerData.activities.map(act => (
                              <div key={act.id} className="p-3 bg-slate-950/30 border border-slate-850 rounded-xl flex items-start gap-2.5">
                                <Clock size={12} className="text-slate-500 mt-1 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-slate-200 text-[11px] leading-relaxed">{act.description}</p>
                                  <p className="text-[9px] text-slate-500 mt-0.5">{formatFullDate(act.created_at)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 6: MARKETING IA */}
                    {drawerTab === 'marketing' && (
                      <div className="space-y-4">
                        <div className="p-4 bg-slate-950 border border-slate-850 rounded-2xl">
                          <h4 className="font-bold text-slate-200 flex items-center gap-1.5"><Sparkles size={14} className="text-cyan-400" /> Generador de Copy Inmobiliario</h4>
                          <p className="text-[11px] text-slate-400 mt-1">Seleccione una de las 16 herramientas y la IA redactará los materiales profesionales adaptados a este inmueble.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          {marketingToolsList.map(tool => (
                            <button key={tool.id} onClick={() => handleGenerateMarketing(tool.id)} className={`p-3 border rounded-xl text-left transition-all ${marketingAssetType === tool.id && marketingAssetContent ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-slate-950/40 border-slate-850 text-slate-300 hover:border-slate-700'}`}>
                              <p className="font-bold">{tool.label}</p>
                              <p className="text-[9px] text-slate-500 truncate mt-0.5">{tool.desc}</p>
                            </button>
                          ))}
                        </div>

                        {loadingMarketing && (
                          <div className="flex items-center justify-center py-6 gap-2"><Loader2 size={16} className="animate-spin text-blue-500" /><span className="text-slate-400 text-[10px]">Generando copia comercial con la IA...</span></div>
                        )}

                        {marketingAssetContent && (
                          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                              <h4 className="font-bold text-slate-200 capitalize">{marketingAssetType.replace('_', ' ')}</h4>
                              <button onClick={() => { navigator.clipboard?.writeText(marketingAssetContent); toast.success('Texto copiado al portapapeles') }} className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-300 hover:text-white flex items-center gap-1.5"><Copy size={11} /> Copiar Texto</button>
                            </div>
                            <textarea readOnly rows={8} value={marketingAssetContent} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-[11px] leading-relaxed text-slate-200 outline-none font-mono resize-none" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 7: OPTIMIZACIÓN IA */}
                    {drawerTab === 'ia' && (
                      <div className="space-y-4">
                        <div className="p-4 bg-slate-950 border border-slate-850 rounded-2xl text-center">
                          <h4 className="font-bold text-slate-200 flex items-center justify-center gap-1.5"><Sparkles size={16} className="text-amber-400" /> Consultoría de Optimización IA</h4>
                          <p className="text-[11px] text-slate-400 mt-1">Inspeccione la ficha actual y compare las mejoras sugeridas de Home Staging, Títulos, Descripciones y Precios sugeridos antes de aplicarlos.</p>
                          {!improvementData && (
                            <button onClick={handleLoadAIImprovement} disabled={loadingImprovement} className="mt-4 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl text-white font-bold flex items-center gap-1.5 mx-auto disabled:opacity-50">
                              {loadingImprovement ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                              {loadingImprovement ? 'Analizando...' : 'Iniciar Análisis de Optimización'}
                            </button>
                          )}
                        </div>

                        {loadingImprovement && (
                          <div className="flex items-center justify-center py-6 gap-2"><Loader2 size={16} className="animate-spin text-blue-500" /><span className="text-slate-400 text-[10px]">Analizando ficha inmobiliaria...</span></div>
                        )}

                        {improvementData && (
                          <div className="space-y-4">
                            
                            {/* Score comparison */}
                            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-950 border border-slate-850 rounded-2xl text-center">
                              <div className="border-r border-slate-900">
                                <p className="text-lg font-black text-rose-400">{improvementData.scoreBefore}%</p>
                                <p className="text-[9px] text-slate-500 uppercase">Score Original</p>
                              </div>
                              <div>
                                <p className="text-lg font-black text-emerald-400">{improvementData.scoreAfter}%</p>
                                <p className="text-[9px] text-slate-500 uppercase">Score Mejorado</p>
                              </div>
                            </div>

                            {/* Suggestions List */}
                            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                              <h4 className="font-bold text-slate-200 flex items-center gap-1.5"><Lightbulb size={13} className="text-amber-400" /> Checklist de mejoras sugeridas</h4>
                              <div className="space-y-1.5">
                                {improvementData.improvements_suggested?.map((sug, i) => (
                                  <p key={i} className="text-[11px] text-slate-350 leading-relaxed">• {sug}</p>
                                ))}
                              </div>
                            </div>

                            {/* Target clients & Price suggestion */}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl space-y-1">
                                <span className="text-slate-400 text-[10px]">Público objetivo sugerido:</span>
                                <p className="font-semibold text-slate-200 leading-tight">{improvementData.target_client}</p>
                              </div>
                              <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl space-y-1">
                                <span className="text-slate-400 text-[10px]">Precio de mercado estimado:</span>
                                <p className="font-semibold text-slate-200">{formatCurrency(improvementData.after.price)}</p>
                              </div>
                            </div>

                            {/* Before & After comparison visual */}
                            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                              <h4 className="font-bold text-slate-200 flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-400" /> Comparativa de Título y Ficha</h4>
                              
                              <div className="space-y-2.5">
                                <div className="p-2.5 bg-rose-500/5 border border-rose-500/10 rounded-xl">
                                  <span className="text-rose-400 font-bold text-[9px] uppercase tracking-wider">ANTES (Original)</span>
                                  <p className="font-semibold text-slate-300 mt-1">{improvementData.before.title}</p>
                                </div>
                                <div className="p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                                  <span className="text-emerald-400 font-bold text-[9px] uppercase tracking-wider">DESPUÉS (Propuesta de la IA)</span>
                                  <p className="font-semibold text-slate-100 mt-1">{improvementData.after.title}</p>
                                  <p className="text-[10px] text-slate-400 leading-relaxed mt-2 whitespace-pre-wrap">{improvementData.after.description}</p>
                                </div>
                              </div>
                            </div>

                            {/* Action to Apply */}
                            <div className="flex gap-3">
                              <button onClick={() => setImprovementData(null)} className="flex-1 py-2.5 font-bold text-slate-400 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all">Re-analizar</button>
                              <button onClick={handleApplyAIImprovement} disabled={saving} className="flex-1 py-2.5 font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl transition-all shadow-md flex items-center justify-center gap-2">
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <ThumbsUp size={14} />}
                                {saving ? 'Aplicando...' : 'Aplicar Mejoras de IA'}
                              </button>
                            </div>

                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </div>

              {/* Bottom close footer */}
              <div className="p-4 bg-slate-950 border-t border-slate-800/80 shrink-0 flex items-center justify-end">
                <button onClick={() => { setDrawerProperty(null); setDrawerData(null) }} className="px-5 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded-xl font-bold border border-slate-800 transition-all text-xs">Cerrar expediente</button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  )
}

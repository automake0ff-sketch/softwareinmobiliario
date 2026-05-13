import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, Plus, Search, Home, Bed, Bath, Maximize,
  MapPin, DollarSign, X, Filter, Image, ChevronDown,
  Type, Hash, Calendar, Edit3
} from 'lucide-react'
import { useStore } from '../lib/store'
import {
  formatCurrency, getPropertyTypeLabel, getOperationLabel,
  getInitials, formatDate
} from '../utils/formatters'

const initialProperties = [
  { id: 'p1', title: 'Ático con terraza - Centro', reference: 'AT-234', type: 'penthouse', operation: 'sale', price: 385000, city: 'Madrid', zone: 'Centro', beds: 3, baths: 2, surface: 120, status: 'available', description: 'Espectacular ático en el centro con terraza de 40m². Totalmente reformado, 3 habitaciones, 2 baños, garaje y trastero. Cocina equipada, suelos de parquet, climatización eficiente.', created_at: '2026-04-01T10:00:00Z' },
  { id: 'p2', title: 'Casa adosada - Norte', reference: 'CA-189', type: 'townhouse', operation: 'sale', price: 520000, city: 'Madrid', zone: 'Norte', beds: 4, baths: 3, surface: 180, status: 'available', description: 'Amplia casa adosada en zona norte. 4 habitaciones, 3 baños, jardín privado, garaje para 2 coches. Excelente estado, lista para entrar a vivir.', created_at: '2026-03-15T14:30:00Z' },
  { id: 'p3', title: 'Apartamento - Sur', reference: 'AP-456', type: 'apartment', operation: 'sale', price: 220000, city: 'Madrid', zone: 'Sur', beds: 2, baths: 1, surface: 75, status: 'reserved', description: 'Apartamento luminoso en zona sur. 2 habitaciones, 1 baño, cocina americana, balcón. Cerca de metro y servicios. Ideal para parejas.', created_at: '2026-04-20T09:15:00Z' },
  { id: 'p4', title: 'Villa con piscina - Oeste', reference: 'VL-078', type: 'villa', operation: 'sale', price: 890000, city: 'Madrid', zone: 'Oeste', beds: 5, baths: 4, surface: 250, status: 'available', description: 'Impresionante villa con piscina en zona oeste. 5 habitaciones, 4 baños, amplio jardín, garaje para 3 coches. Acabados de lujo.', created_at: '2026-02-01T11:00:00Z' },
  { id: 'p5', title: 'Estudio - Centro', reference: 'ES-012', type: 'studio', operation: 'rent', price: 950, city: 'Madrid', zone: 'Centro', beds: 1, baths: 1, surface: 35, status: 'available', description: 'Estudio céntrico completamente amueblado. Ideal para estudiantes o profesionales. 35m², cocina americana, baño completo. Gastos incluidos.', created_at: '2026-05-01T08:00:00Z' },
  { id: 'p6', title: 'Local comercial - Centro', reference: 'LC-345', type: 'commercial', operation: 'rent', price: 2500, city: 'Madrid', zone: 'Centro', beds: 0, baths: 1, surface: 80, status: 'sold', description: 'Local comercial en pleno centro. 80m², escaparate, baño. Ideal para tienda o restaurante. Alto tránsito peatonal.', created_at: '2026-01-10T16:45:00Z' },
  { id: 'p7', title: 'Dúplex - Este', reference: 'DX-567', type: 'duplex', operation: 'sale', price: 410000, city: 'Madrid', zone: 'Este', beds: 3, baths: 2, surface: 110, status: 'available', description: 'Dúplex en zona este con terraza y vistas. 3 habitaciones, 2 baños, dos plantas. Cocina reformada, armarios empotrados, plaza de garaje incluida.', created_at: '2026-04-10T13:20:00Z' },
  { id: 'p8', title: 'Terreno edificable - Norte', reference: 'TR-222', type: 'land', operation: 'sale', price: 180000, city: 'Madrid', zone: 'Norte', beds: 0, baths: 0, surface: 500, status: 'available', description: 'Terreno edificable en zona norte en expansión. 500m², edificabilidad 0.6. Ideal para promoción de viviendas. Todos los servicios disponibles.', created_at: '2026-03-20T10:30:00Z' },
  { id: 'p9', title: 'Oficina - Centro', reference: 'OF-890', type: 'office', operation: 'rent', price: 1800, city: 'Madrid', zone: 'Centro', beds: 0, baths: 2, surface: 100, status: 'reserved', description: 'Oficina diáfana en edificio corporativo. 100m², 2 baños, sala de reuniones. Parking opcional. Alquiler incluye comunidad y mantenimiento.', created_at: '2026-04-25T12:00:00Z' },
]

const typeOptions = [
  { value: '', label: 'Todos los tipos' },
  { value: 'apartment', label: 'Apartamento' },
  { value: 'house', label: 'Casa' },
  { value: 'penthouse', label: 'Ático' },
  { value: 'studio', label: 'Estudio' },
  { value: 'duplex', label: 'Dúplex' },
  { value: 'townhouse', label: 'Adosado' },
  { value: 'villa', label: 'Villa' },
  { value: 'land', label: 'Terreno' },
  { value: 'commercial', label: 'Local' },
  { value: 'office', label: 'Oficina' },
]

const operationOptions = [
  { value: '', label: 'Todas las operaciones' },
  { value: 'sale', label: 'Venta' },
  { value: 'rent', label: 'Alquiler' },
]

const statusOptions = [
  { value: '', label: 'Todos los estados' },
  { value: 'available', label: 'Disponible' },
  { value: 'reserved', label: 'Reservado' },
  { value: 'sold', label: 'Vendido' },
]

const propertyTypeIcons = {
  apartment: Home, house: Home, penthouse: Home, studio: Home,
  duplex: Home, townhouse: Home, villa: Home, land: MapPin,
  commercial: Building2, office: Building2,
}

const propertyStatusColors = {
  available: 'bg-ok/10 text-ok border-ok/20',
  reserved: 'bg-warn/10 text-warn border-warn/20',
  sold: 'bg-err/10 text-err border-err/20',
}

const propertyStatusLabels = {
  available: 'Disponible',
  reserved: 'Reservado',
  sold: 'Vendido',
}

export default function PropertiesPage() {
  const { properties, createProperty } = useStore()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [operationFilter, setOperationFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [filteredProperties, setFilteredProperties] = useState([])

  useEffect(() => {
    if (properties.length === 0) {
      useStore.setState({ properties: [...initialProperties] })
    }
  }, [])

  const displayProperties = useMemo(() => {
    return properties.length > 0 ? properties : initialProperties
  }, [properties])

  useEffect(() => {
    let result = [...displayProperties]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.title?.toLowerCase().includes(q) ||
        p.reference?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.zone?.toLowerCase().includes(q)
      )
    }
    if (typeFilter) result = result.filter(p => p.type === typeFilter)
    if (operationFilter) result = result.filter(p => p.operation === operationFilter)
    if (statusFilter) result = result.filter(p => p.status === statusFilter)
    if (priceMin) result = result.filter(p => p.price >= Number(priceMin))
    if (priceMax) result = result.filter(p => p.price <= Number(priceMax))
    setFilteredProperties(result)
  }, [displayProperties, search, typeFilter, operationFilter, statusFilter, priceMin, priceMax])

  const handleAddProperty = () => {
    const newProperty = {
      id: `p${Date.now()}`,
      title: 'Nueva propiedad',
      reference: `REF-${String(displayProperties.length + 1).padStart(3, '0')}`,
      type: 'apartment',
      operation: 'sale',
      price: 0,
      city: 'Madrid',
      zone: 'Centro',
      beds: 2,
      baths: 1,
      surface: 70,
      status: 'available',
      description: 'Descripción de la propiedad.',
      created_at: new Date().toISOString(),
    }
    useStore.setState(s => ({ properties: [newProperty, ...s.properties] }))
    setShowAddModal(false)
  }

  const container = {
    hidden: { opacity: 0 },
    show: { transition: { staggerChildren: 0.04 } }
  }
  const itemAnim = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 text-amber-500 flex items-center justify-center shadow-sm">
            <Building2 size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink font-syne">Propiedades</h1>
            <p className="text-sm text-muted">{filteredProperties.length} inmuebles</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por título o ref..."
              className="w-56 lg:w-64 pl-9 pr-3 py-2.5 text-sm bg-white border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-2.5 rounded-xl border border-border bg-white text-muted hover:text-ink hover:border-border2 transition-all"
          >
            <Filter size={18} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all text-sm font-medium shadow-sm"
          >
            <Plus size={16} />
            Nueva propiedad
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Tipo</label>
                  <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                  >
                    {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Operación</label>
                  <select
                    value={operationFilter}
                    onChange={e => setOperationFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                  >
                    {operationOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Estado</label>
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                  >
                    {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Precio mín</label>
                  <input
                    type="number"
                    value={priceMin}
                    onChange={e => setPriceMin(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Precio máx</label>
                  <input
                    type="number"
                    value={priceMax}
                    onChange={e => setPriceMax(e.target.value)}
                    placeholder="999999"
                    className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => { setTypeFilter(''); setOperationFilter(''); setStatusFilter(''); setPriceMin(''); setPriceMax('') }}
                    className="w-full px-3 py-2 text-sm text-muted hover:text-ink bg-surface hover:bg-surface2 rounded-xl transition-all"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {filteredProperties.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-white rounded-2xl border border-border p-16 flex flex-col items-center justify-center text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-surface2 flex items-center justify-center mb-4">
            <Building2 size={32} className="text-muted2" />
          </div>
          <h3 className="text-lg font-semibold text-ink mb-1">No hay propiedades</h3>
          <p className="text-sm text-muted max-w-sm">
            {search || typeFilter || statusFilter
              ? 'No se encontraron propiedades con los filtros actuales.'
              : 'Añade tu primera propiedad para empezar a gestionar tu catálogo.'}
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          <AnimatePresence mode="popLayout">
            {filteredProperties.map(property => {
              const TypeIcon = propertyTypeIcons[property.type] || Home
              return (
                <motion.div
                  key={property.id}
                  variants={itemAnim}
                  layout
                  onClick={() => setSelectedProperty(property)}
                  className="bg-white rounded-2xl border border-border overflow-hidden hover:shadow-card transition-all cursor-pointer group"
                >
                  <div className="h-40 bg-gradient-to-br from-amber-100 via-amber-50 to-orange-100 flex items-center justify-center relative">
                    <TypeIcon size={48} className="text-amber-300/60" />
                    <span className="absolute top-3 left-3 px-2.5 py-1 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-ink shadow-sm">
                      {property.reference}
                    </span>
                    <span className={`absolute top-3 right-3 px-2.5 py-1 rounded-lg text-xs font-medium border backdrop-blur-sm ${propertyStatusColors[property.status] || 'bg-muted/10 text-muted border-muted/20'}`}>
                      {propertyStatusLabels[property.status] || property.status}
                    </span>
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                      <span className="px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-muted capitalize">
                        {getPropertyTypeLabel(property.type)}
                      </span>
                      <span className="px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-muted">
                        {getOperationLabel(property.operation)}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink group-hover:text-blue-500 transition-colors leading-tight truncate">
                        {property.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted">
                      <MapPin size={12} className="text-muted2 shrink-0" />
                      <span className="truncate">{property.city}, {property.zone}</span>
                    </div>
                    <p className="text-lg font-bold text-ink">{formatCurrency(property.price)}</p>
                    <div className="flex items-center gap-3 text-xs text-muted pt-1 border-t border-border">
                      {property.beds > 0 && (
                        <span className="flex items-center gap-1">
                          <Bed size={12} className="text-muted2" />
                          {property.beds}
                        </span>
                      )}
                      {property.baths > 0 && (
                        <span className="flex items-center gap-1">
                          <Bath size={12} className="text-muted2" />
                          {property.baths}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Maximize size={12} className="text-muted2" />
                        {property.surface}m²
                      </span>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {selectedProperty && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedProperty(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-modal border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="relative">
                <div className="h-48 bg-gradient-to-br from-amber-100 via-amber-50 to-orange-100 flex items-center justify-center">
                  <Building2 size={64} className="text-amber-300/40" />
                </div>
                <button
                  onClick={() => setSelectedProperty(null)}
                  className="absolute top-4 right-4 p-2 bg-white/90 backdrop-blur-sm rounded-xl text-muted hover:text-ink transition-all"
                >
                  <X size={18} />
                </button>
                <div className="absolute bottom-4 left-4 flex gap-2">
                  <span className={`px-3 py-1.5 rounded-lg text-xs font-medium border backdrop-blur-sm bg-white/90 ${propertyStatusColors[selectedProperty.status] || 'bg-muted/10 text-muted border-muted/20'}`}>
                    {propertyStatusLabels[selectedProperty.status] || selectedProperty.status}
                  </span>
                  <span className="px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-ink">
                    Ref: {selectedProperty.reference}
                  </span>
                </div>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-ink font-syne">{selectedProperty.title}</h2>
                  <div className="flex items-center gap-1.5 text-sm text-muted mt-1">
                    <MapPin size={14} className="text-muted2" />
                    <span>{selectedProperty.city}, {selectedProperty.zone}</span>
                    <span className="w-1 h-1 rounded-full bg-muted2 mx-1" />
                    <span className="capitalize">{getPropertyTypeLabel(selectedProperty.type)}</span>
                    <span className="w-1 h-1 rounded-full bg-muted2 mx-1" />
                    <span>{getOperationLabel(selectedProperty.operation)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-ink">{formatCurrency(selectedProperty.price)}</p>
                    <p className="text-xs text-muted">{selectedProperty.operation === 'rent' ? '/mes' : ''}</p>
                  </div>
                  {selectedProperty.beds > 0 && (
                    <div className="text-center">
                      <p className="text-2xl font-bold text-ink">{selectedProperty.beds}</p>
                      <p className="text-xs text-muted">Habitaciones</p>
                    </div>
                  )}
                  {selectedProperty.baths > 0 && (
                    <div className="text-center">
                      <p className="text-2xl font-bold text-ink">{selectedProperty.baths}</p>
                      <p className="text-xs text-muted">Baños</p>
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-2xl font-bold text-ink">{selectedProperty.surface}</p>
                    <p className="text-xs text-muted">m²</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Descripción</h3>
                  <p className="text-sm text-ink leading-relaxed">{selectedProperty.description}</p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <span className="text-xs text-muted">Creado: {formatDate(selectedProperty.created_at)}</span>
                  <button className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-500 bg-blue-50 rounded-xl hover:bg-blue-100 transition-all">
                    <Edit3 size={14} />
                    Editar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-modal border border-border w-full max-w-lg p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold font-syne text-ink">Nueva propiedad</h2>
                <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Título', placeholder: 'Ej: Ático con terraza', colSpan: 2 },
                  { label: 'Tipo', placeholder: 'Apartamento', colSpan: 1 },
                  { label: 'Operación', placeholder: 'Venta', colSpan: 1 },
                  { label: 'Precio (€)', placeholder: '300000', colSpan: 1 },
                  { label: 'Ciudad', placeholder: 'Madrid', colSpan: 1 },
                  { label: 'Zona', placeholder: 'Centro', colSpan: 1 },
                  { label: 'Habitaciones', placeholder: '3', colSpan: 1 },
                  { label: 'Baños', placeholder: '2', colSpan: 1 },
                  { label: 'Superficie (m²)', placeholder: '120', colSpan: 2 },
                ].map(field => (
                  <div key={field.label} className={field.colSpan === 2 ? 'col-span-2' : 'col-span-1'}>
                    <label className="text-xs font-medium text-muted block mb-1">{field.label}</label>
                    <input
                      type="text"
                      placeholder={field.placeholder}
                      className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-6">
                <button onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-muted hover:text-ink bg-surface hover:bg-surface2 rounded-xl transition-all">
                  Cancelar
                </button>
                <button onClick={handleAddProperty} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-xl transition-all">
                  Crear propiedad
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

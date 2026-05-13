import { useState } from 'react'
import { motion } from 'framer-motion'
import { Zap, Info } from 'lucide-react'
import styles from './AuditForm.module.css'

const TIPOS = ['Piso', 'Casa / Chalet', 'Atico', 'Duplex', 'Estudio', 'Local comercial', 'Oficina', 'Solar', 'Otro']

const DEFAULT = {
  titulo: '', descripcion: '', precio: '', fotos: '',
  ubicacion: '', tipo: '', metros: '', habitaciones: '',
}

export default function AuditForm({ onSubmit, loading, disabled }) {
  const [form, setForm] = useState(DEFAULT)
  const [errors, setErrors] = useState({})
  const charCount = form.descripcion.length

  const set = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.titulo.trim() || form.titulo.length < 10) e.titulo = 'Minimo 10 caracteres'
    if (!form.descripcion.trim() || form.descripcion.length < 50) e.descripcion = 'Minimo 50 caracteres'
    if (!form.precio.trim()) e.precio = 'Introduce el precio'
    else if (!/^[\d.,\sEUR$]+$/.test(form.precio)) e.precio = 'Solo numeros, puntos, comas y simbolos de moneda'
    if (!form.fotos.trim()) e.fotos = 'Numero requerido'
    else {
      const num = Number(form.fotos)
      if (isNaN(num) || num < 0 || num > 99) e.fotos = 'Numero entre 0 y 99'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return
    onSubmit({ ...form, fotos: Number(form.fotos) })
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      className={styles.form}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Datos principales <span className={styles.req}>* requeridos</span></h2>

        <div className={styles.field}>
          <label>Titulo del anuncio *</label>
          <input
            type="text"
            value={form.titulo}
            onChange={set('titulo')}
            placeholder="Ej: Piso luminoso 3 hab con terraza en Triana, Sevilla"
            maxLength={150}
            className={errors.titulo ? styles.inputError : ''}
          />
          {errors.titulo && <span className={styles.error}>{errors.titulo}</span>}
        </div>

        <div className={styles.field}>
          <label>
            Descripcion *
            <span className={`${styles.charCount} ${charCount > 1400 ? styles.charOver : ''}`}>
              {charCount} / 1.500
            </span>
          </label>
          <textarea
            value={form.descripcion}
            onChange={set('descripcion')}
            placeholder="Copia aqui la descripcion completa del anuncio tal como esta publicada..."
            maxLength={1500}
            rows={6}
            className={errors.descripcion ? styles.inputError : ''}
          />
          {errors.descripcion && <span className={styles.error}>{errors.descripcion}</span>}
        </div>

        <div className={styles.row2}>
          <div className={styles.field}>
            <label>Precio publicado *</label>
            <input
              type="text"
              value={form.precio}
              onChange={set('precio')}
              placeholder="Ej: 285.000 EUR"
              className={errors.precio ? styles.inputError : ''}
            />
            {errors.precio && <span className={styles.error}>{errors.precio}</span>}
          </div>
          <div className={styles.field}>
            <label>Nº de fotos publicadas *</label>
            <input
              type="number"
              value={form.fotos}
              onChange={set('fotos')}
              placeholder="Ej: 8"
              min={0}
              max={99}
              className={errors.fotos ? styles.inputError : ''}
            />
            {errors.fotos && <span className={styles.error}>{errors.fotos}</span>}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Datos adicionales
          <span className={styles.optional}>(mejora la precision del analisis)</span>
        </h2>

        <div className={styles.row3}>
          <div className={styles.field}>
            <label>Tipo de inmueble</label>
            <select value={form.tipo} onChange={set('tipo')}>
              <option value="">Seleccionar...</option>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label>Metros cuadrados</label>
            <input
              type="text"
              value={form.metros}
              onChange={set('metros')}
              placeholder="Ej: 90 m2"
            />
          </div>
          <div className={styles.field}>
            <label>Habitaciones</label>
            <input
              type="text"
              value={form.habitaciones}
              onChange={set('habitaciones')}
              placeholder="Ej: 3"
            />
          </div>
        </div>

        <div className={styles.field}>
          <label>Ubicacion / Barrio</label>
          <input
            type="text"
            value={form.ubicacion}
            onChange={set('ubicacion')}
            placeholder="Ej: Triana, Sevilla"
          />
        </div>
      </div>

      <div className={styles.infoBox}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          4 agentes de IA trabajaran en paralelo para analizar tu anuncio: analista, copywriter, tasador y orquestador.
          El analisis tarda entre 15 y 30 segundos.
        </span>
      </div>

      <button
        type="submit"
        className="btn btn-primary"
        style={{ width: '100%', padding: '16px', fontSize: '16px', borderRadius: '14px' }}
        disabled={loading || disabled}
      >
        {loading ? (
          <>
            <span className={styles.spinner} />
            Analizando con IA...
          </>
        ) : (
          <>
            <Zap size={18} />
            Auditar anuncio con IA
          </>
        )}
      </button>

      {disabled && (
        <p className={styles.limitMsg}>
          Has usado tus 3 auditorias gratuitas. <a href="/pricing" style={{ color: 'var(--gold)' }}>Activa Pro</a> para continuar.
        </p>
      )}
    </motion.form>
  )
}

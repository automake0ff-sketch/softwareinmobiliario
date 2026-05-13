import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle, XCircle, TrendingUp, Camera, Copy, Download,
  ArrowRight, AlertTriangle, Star, BarChart2, Tag, Clock, Share2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { exportToPDF } from '../lib/exportPDF'
import { shareResult } from '../utils/sharing'
import styles from './AuditResults.module.css'

function ScoreRing({ score }) {
  const r = 54
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 70 ? '#4CAF7D' : score >= 45 ? '#E09A3C' : '#E05C5C'
  const label = score >= 70 ? 'Buen anuncio' : score >= 45 ? 'Mejorable' : 'Anuncio debil'

  return (
    <div className={styles.scoreWrap}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="var(--surface2)" strokeWidth="10" />
        <motion.circle
          cx="65" cy="65" r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          transform="rotate(-90 65 65)"
          style={{ filter: `drop-shadow(0 0 8px ${color}60)` }}
        />
      </svg>
      <div className={styles.scoreInner}>
        <motion.div
          className={styles.scoreNumber}
          style={{ color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {score}
        </motion.div>
        <div className={styles.scoreLabel}>/ 100</div>
      </div>
      <div className={styles.scoreTag} style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}>
        {label}
      </div>
    </div>
  )
}

function SubScore({ label, value, max }) {
  const pct = Math.round((value / max) * 100)
  const color = pct >= 70 ? 'var(--green)' : pct >= 45 ? 'var(--amber)' : 'var(--red)'
  return (
    <div className={styles.subScore}>
      <div className={styles.subScoreHeader}>
        <span className={styles.subScoreLabel}>{label}</span>
        <span className={styles.subScoreVal} style={{ color }}>{value}/{max}</span>
      </div>
      <div className={styles.subScoreBar}>
        <motion.div
          className={styles.subScoreFill}
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
      </div>
    </div>
  )
}

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } }

export default function AuditResults({ result, onReset }) {
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)

  const copyDesc = () => {
    navigator.clipboard.writeText(result.descripcion_optimizada || '')
    setCopied(true)
    toast.success('Descripcion copiada al portapapeles')
    setTimeout(() => setCopied(false), 2500)
  }

  const copyTitle = () => {
    navigator.clipboard.writeText(result.titulo_optimizado || '')
    toast.success('Titulo copiado')
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportToPDF(result)
      toast.success('PDF descargado correctamente')
    } catch {
      toast.error('Error al generar el PDF')
    } finally {
      setExporting(false)
    }
  }

  const handleShare = () => {
    try {
      shareResult(result)
      toast.success('Enlace copiado al portapapeles')
    } catch {
      toast.error('Error al copiar el enlace')
    }
  }

  const score = result.score_general || 0

  return (
    <motion.div
      className={styles.container}
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={fadeUp} className={styles.hero}>
        <ScoreRing score={score} />
        <div className={styles.heroContent}>
          <h2 className={styles.heroTitle}>Auditoria completada</h2>
          <p className={styles.heroSummary}>{result.resumen_ejecutivo}</p>
          {result.impacto_estimado && (
            <div className={styles.impactBadge}>
              <TrendingUp size={14} />
              {result.impacto_estimado}
            </div>
          )}
          <div className={styles.heroActions}>
            <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
              <Download size={15} />
              {exporting ? 'Generando PDF...' : 'Descargar informe'}
            </button>
            <button className="btn btn-ghost" onClick={handleShare}>
              <Share2 size={15} />
              Compartir
            </button>
            <button className="btn btn-ghost" onClick={onReset}>
              Auditar otro anuncio
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className={styles.card}>
        <h3 className={styles.cardTitle}><BarChart2 size={15} /> Puntuacion por seccion</h3>
        <div className={styles.subScores}>
          <SubScore label="Titulo" value={result.scores?.titulo || 0} max={25} />
          <SubScore label="Descripcion" value={result.scores?.descripcion || 0} max={35} />
          <SubScore label="Fotos" value={result.scores?.fotos || 0} max={20} />
          <SubScore label="Completitud" value={result.scores?.completitud || 0} max={20} />
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className={styles.row2}>
        <div className={styles.card}>
          <h3 className={styles.cardTitle} style={{ color: 'var(--red)' }}>
            <XCircle size={15} /> Errores que cuestan leads
          </h3>
          <ul className={styles.list}>
            {(result.errores_clave || []).map((e, i) => (
              <li key={i} className={styles.listItem}>
                <span className={styles.iconBad}>x</span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.card}>
          <h3 className={styles.cardTitle} style={{ color: 'var(--green)' }}>
            <Star size={15} /> Fortalezas actuales
          </h3>
          <ul className={styles.list}>
            {(result.fortalezas || []).map((f, i) => (
              <li key={i} className={styles.listItem}>
                <span className={styles.iconGood}>+</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className={styles.card}>
        <h3 className={styles.cardTitle}><ArrowRight size={15} /> Plan de accion prioritario</h3>
        <div className={styles.mejoras}>
          {(result.mejoras_prioritarias || []).map((m, i) => (
            <div key={i} className={styles.mejora}>
              <div className={styles.mejoraNum}>{i + 1}</div>
              <span>{m}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className={styles.card}>
        <h3 className={styles.cardTitle}><AlertTriangle size={15} /> Diagnostico por seccion</h3>
        <div className={styles.grid2}>
          {[
            ['Titulo', result.analisis?.titulo],
            ['Descripcion', result.analisis?.descripcion],
            ['Precio', result.analisis?.precio],
            ['Fotos', result.analisis?.fotos],
          ].map(([label, val]) => (
            <div key={label} className={styles.analysisItem}>
              <div className={styles.analysisLabel}>{label}</div>
              <p className={styles.analysisText}>{val || '\u2014'}</p>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className={styles.card}>
        <h3 className={styles.cardTitle}><Copy size={15} /> Titulo + Descripcion optimizados</h3>

        <div className={styles.optimizedTitle}>
          <div className={styles.optimizedTitleLabel}>Nuevo titulo</div>
          <div className={styles.optimizedTitleText}>{result.titulo_optimizado}</div>
          <button className={styles.copyBtn} onClick={copyTitle}>
            <Copy size={12} /> Copiar titulo
          </button>
        </div>

        {result.palabras_clave?.length > 0 && (
          <div className={styles.keywords}>
            <Tag size={12} style={{ color: 'var(--text3)' }} />
            {result.palabras_clave.map((k, i) => (
              <span key={i} className={styles.keyword}>{k}</span>
            ))}
          </div>
        )}

        <div className={styles.descBox}>
          <div className={styles.descText}>{result.descripcion_optimizada}</div>
          <button
            className={`${styles.copyBtnLarge} ${copied ? styles.copied : ''}`}
            onClick={copyDesc}
          >
            <Copy size={14} />
            {copied ? 'Copiado!' : 'Copiar descripcion'}
          </button>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className={styles.row2}>
        <div className={styles.card}>
          <h3 className={styles.cardTitle} style={{ color: 'var(--amber)' }}>
            <Tag size={15} /> Estrategia de precio
          </h3>
          <div className={styles.priceEval}>{result.evaluacion_precio}</div>
          <div className={styles.priceRange}>
            <div className={styles.priceRangeLabel}>Rango recomendado</div>
            <div className={styles.priceRangeVal}>{result.rango_recomendado}</div>
          </div>
          <div className={styles.priceStrategy}>{result.estrategia_precio}</div>
          {result.precio_psicologico && (
            <div className={styles.pricePsycho}>
              <Star size={12} />
              <strong>Precio psicologico:</strong> {result.precio_psicologico}
            </div>
          )}
        </div>
        <div className={styles.card}>
          <h3 className={styles.cardTitle} style={{ color: 'var(--blue)' }}>
            <Clock size={15} /> Tiempo estimado de venta
          </h3>
          <div className={styles.timeEstimate}>{result.tiempo_venta_estimado || '\u2014'}</div>
          <p className={styles.timeSub}>Con las mejoras aplicadas, este plazo puede reducirse significativamente.</p>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className={styles.card}>
        <h3 className={styles.cardTitle}>
          <Camera size={15} /> Fotos a anadir
          {result.fotos_minimas && (
            <span className={styles.fotosMin}>minimo recomendado: {result.fotos_minimas} fotos</span>
          )}
        </h3>
        <div className={styles.fotosList}>
          {(result.recomendaciones_fotos || []).map((f, i) => (
            <div key={i} className={styles.fotosItem}>
              <div className={styles.fotosNum}>{i + 1}</div>
              <span>{f}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className={styles.bottomActions}>
        <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
          <Download size={15} />
          {exporting ? 'Generando...' : 'Descargar informe PDF'}
        </button>
        <button className="btn btn-ghost" onClick={onReset}>
          Auditar otro anuncio
        </button>
      </motion.div>
    </motion.div>
  )
}

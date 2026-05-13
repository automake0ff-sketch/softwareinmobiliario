import jsPDF from 'jspdf'

export async function exportToPDF(result) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = 210
  const margin = 20
  const contentW = pageW - margin * 2
  let y = 20

  const addText = (text, opts = {}) => {
    const {
      size = 11, weight = 'normal', color = [242, 237, 228],
      align = 'left', maxW = contentW
    } = opts
    doc.setFontSize(size)
    doc.setFont('helvetica', weight)
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(String(text || '\u2014'), maxW)
    if (align === 'center') {
      doc.text(lines, pageW / 2, y, { align: 'center' })
    } else {
      doc.text(lines, margin, y)
    }
    y += lines.length * (size * 0.45) + 2
    return lines.length
  }

  const addSection = (title) => {
    y += 6
    doc.setFillColor(37, 33, 24)
    doc.roundedRect(margin, y - 5, contentW, 10, 2, 2, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(212, 168, 83)
    doc.text(title.toUpperCase(), margin + 4, y + 1)
    y += 10
  }

  const newPageIfNeeded = (needed = 20) => {
    if (y + needed > 275) {
      doc.addPage()
      doc.setFillColor(14, 12, 10)
      doc.rect(0, 0, 210, 297, 'F')
      y = 20
    }
  }

  doc.setFillColor(14, 12, 10)
  doc.rect(0, 0, 210, 297, 'F')

  doc.setFillColor(37, 33, 24)
  doc.rect(0, 0, 210, 35, 'F')
  doc.setFillColor(212, 168, 83)
  doc.rect(0, 33, 210, 2, 'F')

  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(212, 168, 83)
  doc.text('PropAI', margin, 18)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(158, 150, 136)
  doc.text('Informe de Auditoria Inmobiliaria', margin, 26)

  doc.setFontSize(9)
  doc.setTextColor(107, 101, 88)
  const fecha = new Date(result.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.text(fecha, pageW - margin, 18, { align: 'right' })

  y = 48

  const score = result.score_general || 0
  const scoreColor = score >= 70 ? [76, 175, 125] : score >= 45 ? [224, 154, 60] : [224, 92, 92]
  doc.setFillColor(...scoreColor)
  doc.circle(margin + 15, y + 10, 14, 'F')
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(14, 12, 10)
  doc.text(String(score), margin + 15, y + 14, { align: 'center' })

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(242, 237, 228)
  doc.text(result.input?.titulo || 'Sin titulo', margin + 36, y + 6)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(158, 150, 136)
  doc.text(result.resumen_ejecutivo || '', margin + 36, y + 14, { maxWidth: contentW - 36 })
  y += 40

  newPageIfNeeded(40)
  addSection('Errores criticos detectados')
  ;(result.errores_clave || []).forEach((e, i) => {
    doc.setFillColor(224, 92, 92, 0.1)
    doc.setTextColor(224, 92, 92)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(`${i + 1}.`, margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(242, 237, 228)
    doc.text(e, margin + 8, y, { maxWidth: contentW - 8 })
    y += 7
    newPageIfNeeded(10)
  })

  newPageIfNeeded(40)
  addSection('Plan de mejoras prioritarias')
  ;(result.mejoras_prioritarias || []).forEach((m, i) => {
    doc.setTextColor(212, 168, 83)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('\u2192', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(242, 237, 228)
    doc.text(m, margin + 8, y, { maxWidth: contentW - 8 })
    y += 7
    newPageIfNeeded(10)
  })

  newPageIfNeeded(50)
  addSection('Analisis por seccion')
  const campos = [
    ['Titulo', result.analisis?.titulo],
    ['Descripcion', result.analisis?.descripcion],
    ['Precio', result.analisis?.precio],
    ['Fotos', result.analisis?.fotos],
  ]
  campos.forEach(([label, val]) => {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(158, 150, 136)
    doc.text(label.toUpperCase() + ':', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(242, 237, 228)
    const lines = doc.splitTextToSize(val || '\u2014', contentW)
    doc.text(lines, margin, y)
    y += lines.length * 5 + 4
    newPageIfNeeded(20)
  })

  doc.addPage()
  doc.setFillColor(14, 12, 10)
  doc.rect(0, 0, 210, 297, 'F')
  y = 20

  addSection('Titulo optimizado')
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(212, 168, 83)
  const tLines = doc.splitTextToSize(result.titulo_optimizado || '\u2014', contentW)
  doc.text(tLines, margin, y)
  y += tLines.length * 7 + 6

  addSection('Descripcion optimizada \u2014 Lista para copiar')
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(242, 237, 228)
  const dLines = doc.splitTextToSize(result.descripcion_optimizada || '\u2014', contentW)
  doc.text(dLines, margin, y)
  y += dLines.length * 5.5 + 8

  addSection('Estrategia de precio')
  doc.setFontSize(10)
  doc.setTextColor(242, 237, 228)
  doc.setFont('helvetica', 'bold')
  doc.text(`Rango recomendado: ${result.rango_recomendado || '\u2014'}`, margin, y)
  y += 7
  doc.setFont('helvetica', 'normal')
  const pLines = doc.splitTextToSize(result.estrategia_precio || '\u2014', contentW)
  doc.text(pLines, margin, y)
  y += pLines.length * 5.5 + 4
  doc.setTextColor(212, 168, 83)
  doc.text(`Precio psicologico: ${result.precio_psicologico || '\u2014'}`, margin, y)
  y += 8

  addSection('Fotos recomendadas')
  ;(result.recomendaciones_fotos || []).forEach((f, i) => {
    doc.setFontSize(9)
    doc.setTextColor(158, 150, 136)
    doc.setFont('helvetica', 'bold')
    doc.text(`${i + 1}`, margin + 3, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(242, 237, 228)
    doc.text(f, margin + 12, y, { maxWidth: contentW - 12 })
    y += 6
  })

  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFillColor(30, 27, 23)
    doc.rect(0, 287, 210, 10, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(107, 101, 88)
    doc.text('PropAI \u2014 Auditor Inmobiliario con IA', margin, 293)
    doc.text(`${i} / ${totalPages}`, pageW - margin, 293, { align: 'right' })
  }

  doc.save(`PropAI_Auditoria_${Date.now()}.pdf`)
}

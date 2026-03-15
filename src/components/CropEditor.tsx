
'use client'
import React, { useRef, useState } from 'react'

export default function CropEditor({ src, x=0.5, y=0.5, onChange }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({x, y})

  function handleClick(e){
    const rect = ref.current.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    const p = {x: Math.max(0, Math.min(1,nx)), y: Math.max(0, Math.min(1,ny))}
    setPos(p)
    onChange && onChange(p)
  }

  return (
    <div style={{position:'relative', width:'100%', maxWidth:400}}>
      <img
        ref={ref}
        src={src}
        onClick={handleClick}
        style={{width:'100%', aspectRatio:'1/1', objectFit:'cover', cursor:'crosshair'}}
      />
      <div
        style={{
          position:'absolute',
          left:`${pos.x*100}%`,
          top:`${pos.y*100}%`,
          transform:'translate(-50%,-50%)',
          width:20,
          height:20,
          borderRadius:'50%',
          border:'3px solid red',
          background:'rgba(255,0,0,0.2)'
        }}
      />
    </div>
  )
}

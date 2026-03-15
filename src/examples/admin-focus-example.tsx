
/*
Example integration inside admin gallery card:

import CropEditor from '@/components/CropEditor'

function FocusButton({item}){
  const [open,setOpen] = useState(false)

  return (
    <>
      <button onClick={()=>setOpen(true)}>🎯 מיקום</button>

      {open && (
        <CropEditor
          src={item.url}
          x={item.crop_focus_x}
          y={item.crop_focus_y}
          onChange={async(p)=>{
            await fetch('/api/admin/media-items',{
              method:'PUT',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({
                id:item.id,
                crop_focus_x:p.x,
                crop_focus_y:p.y
              })
            })
          }}
        />
      )}
    </>
  )
}
*/

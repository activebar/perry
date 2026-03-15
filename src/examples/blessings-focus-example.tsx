
/*
Example integration inside blessings UI:

import CropEditor from '@/components/CropEditor'

<CropEditor
  src={post.media_url}
  x={post.crop_focus_x}
  y={post.crop_focus_y}
  onChange={async(p)=>{
    await fetch('/api/posts',{
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        id:post.id,
        crop_focus_x:p.x,
        crop_focus_y:p.y
      })
    })
  }}
/>
*/

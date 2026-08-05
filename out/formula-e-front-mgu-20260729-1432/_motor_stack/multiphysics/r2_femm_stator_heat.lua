-- R2 FEMM heat radial strip (units mm). 6-arg setsegmentprop required.
newdocument(2)
hi_probdef("millimeters","planar",1e-8,130.0000,30)
hi_addmaterial("tooth",28.0,28.0,5814465.3,0)
hi_addmaterial("yoke",28.0,28.0,7907764.2,0)
hi_addmaterial("jacket_wall",28.0,28.0,0,0)
hi_addboundprop("adiabatic",1,0,0,0,0,0)
hi_addboundprop("jacket_conv",2,0,0,60.0,2352.8146,0)

r0=46.7; r1=55.929759; r2=65.576912; r3=67.576912; w=5

hi_addnode(r0,-w); hi_addnode(r1,-w); hi_addnode(r2,-w); hi_addnode(r3,-w)
hi_addnode(r3,w); hi_addnode(r2,w); hi_addnode(r1,w); hi_addnode(r0,w)

hi_addsegment(r0,-w,r1,-w)
hi_addsegment(r1,-w,r2,-w)
hi_addsegment(r2,-w,r3,-w)
hi_addsegment(r3,-w,r3,w)
hi_addsegment(r3,w,r2,w)
hi_addsegment(r2,w,r1,w)
hi_addsegment(r1,w,r0,w)
hi_addsegment(r0,w,r0,-w)
hi_addsegment(r1,-w,r1,w)
hi_addsegment(r2,-w,r2,w)

hi_selectsegment(r0,0)
hi_setsegmentprop("adiabatic",0,1,0,0,"<None>")
hi_clearselected()
hi_selectsegment((r0+r3)/2,-w)
hi_setsegmentprop("adiabatic",0,1,0,0,"<None>")
hi_clearselected()
hi_selectsegment((r0+r3)/2,w)
hi_setsegmentprop("adiabatic",0,1,0,0,"<None>")
hi_clearselected()
hi_selectsegment(r3,0)
hi_setsegmentprop("jacket_conv",0,1,0,0,"<None>")
hi_clearselected()

hi_addblocklabel((r0+r1)/2,0)
hi_selectlabel((r0+r1)/2,0)
hi_setblockprop("tooth",1,0,0)
hi_clearselected()
hi_addblocklabel((r1+r2)/2,0)
hi_selectlabel((r1+r2)/2,0)
hi_setblockprop("yoke",1,0,0)
hi_clearselected()
hi_addblocklabel((r2+r3)/2,0)
hi_selectlabel((r2+r3)/2,0)
hi_setblockprop("jacket_wall",1,0,0)
hi_clearselected()

hi_saveas("/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/formula-e-front-mgu-20260729-1432/_motor_stack/multiphysics/r2_femm_stator_heat.feh")
hi_analyze(1)
hi_loadsolution()
f=openfile("/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/formula-e-front-mgu-20260729-1432/_motor_stack/multiphysics/r2_femm_samples.txt","w")
write(f,"r_mm,T_C\n")
n=40
for i=0,n do
  r=r0+(r3-r0)*i/n
  v=ho_getpointvalues(r,0)
  if type(v)=="table" then T=v[1] else T=v end
  write(f,format("%g,%s\n", r, tostring(T)))
end
closefile(f)
-- probes
function T_at(r)
  v=ho_getpointvalues(r,0)
  if type(v)=="table" then return v[1] else return v end
end
print(format("PROBE tooth=%g yoke=%g jacket=%g bore=%g", T_at((r0+r1)/2), T_at((r1+r2)/2), T_at(r3), T_at(r0+0.1)))
print("FEMM_R2_OK")
ho_close(); hi_close(); quit()

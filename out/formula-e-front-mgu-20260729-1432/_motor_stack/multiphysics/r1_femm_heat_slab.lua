-- R1 FEMM heat known-answer (Path A). Requires 6-arg setsegmentprop with conductor.
L_mm = 50
H_mm = 20
T0 = 20.0
k = 1.0
qv = 1.0e5
depth_mm = 1000

newdocument(2)
hi_probdef("millimeters", "planar", 1e-8, depth_mm, 30)
hi_addmaterial("slab", k, k, qv, 0)
hi_addboundprop("Tfixed", 0, T0, 0, 0, 0, 0)
hi_addboundprop("insulated", 1, 0, 0, 0, 0, 0)

hi_addnode(0, 0)
hi_addnode(L_mm, 0)
hi_addnode(L_mm, H_mm)
hi_addnode(0, H_mm)
hi_addsegment(0, 0, L_mm, 0)
hi_addsegment(L_mm, 0, L_mm, H_mm)
hi_addsegment(L_mm, H_mm, 0, H_mm)
hi_addsegment(0, H_mm, 0, 0)

-- left x=0 fixed T
hi_selectsegment(0, H_mm/2)
hi_setsegmentprop("Tfixed", 0, 1, 0, 0, "<None>")
hi_clearselected()
-- bottom, right, top insulated (qs=0)
hi_selectsegment(L_mm/2, 0)
hi_setsegmentprop("insulated", 0, 1, 0, 0, "<None>")
hi_clearselected()
hi_selectsegment(L_mm, H_mm/2)
hi_setsegmentprop("insulated", 0, 1, 0, 0, "<None>")
hi_clearselected()
hi_selectsegment(L_mm/2, H_mm)
hi_setsegmentprop("insulated", 0, 1, 0, 0, "<None>")
hi_clearselected()

hi_addblocklabel(L_mm/2, H_mm/2)
hi_selectlabel(L_mm/2, H_mm/2)
hi_setblockprop("slab", 1, 0, 0)
hi_clearselected()

hi_saveas("/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/formula-e-front-mgu-20260729-1432/_motor_stack/multiphysics/r1_femm_heat_slab.feh")
hi_analyze(1)
hi_loadsolution()

f = openfile("/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/formula-e-front-mgu-20260729-1432/_motor_stack/multiphysics/r1_femm_samples.txt", "w")
write(f, "x_mm,T_C\n")
xs = {0, 10, 20, 25, 30, 40, 50}
for i = 1, 7 do
  x = xs[i]
  v = ho_getpointvalues(x, H_mm/2)
  if type(v) == "table" then
    T = v[1]
  else
    T = v
  end
  write(f, format("%g,%s\n", x, tostring(T)))
end
closefile(f)
print("FEMM_HEAT_R1_OK")
ho_close()
hi_close()
quit()

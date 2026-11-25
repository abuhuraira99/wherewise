"""Convert the LFB animal rescue workbook to a compact CSV with WGS84 coordinates.
OSGB36 National Grid -> lat/lon (Airy 1830) -> Helmert -> WGS84."""
import sys, csv, math, openpyxl

def bng_to_wgs84(E, N):
    a, b = 6377563.396, 6356256.909
    F0 = 0.9996012717; lat0 = math.radians(49); lon0 = math.radians(-2)
    N0, E0 = -100000, 400000
    e2 = 1 - (b*b)/(a*a); n = (a-b)/(a+b)
    lat, M = lat0, 0
    while N - N0 - M >= 0.00001:
        lat = (N - N0 - M)/(a*F0) + lat
        Ma = (1 + n + 5/4*n**2 + 5/4*n**3) * (lat-lat0)
        Mb = (3*n + 3*n**2 + 21/8*n**3) * math.sin(lat-lat0) * math.cos(lat+lat0)
        Mc = (15/8*n**2 + 15/8*n**3) * math.sin(2*(lat-lat0)) * math.cos(2*(lat+lat0))
        Md = 35/24*n**3 * math.sin(3*(lat-lat0)) * math.cos(3*(lat+lat0))
        M = b * F0 * (Ma - Mb + Mc - Md)
    cosLat, sinLat = math.cos(lat), math.sin(lat)
    nu = a*F0/math.sqrt(1-e2*sinLat**2)
    rho = a*F0*(1-e2)/(1-e2*sinLat**2)**1.5
    eta2 = nu/rho - 1
    tanLat = math.tan(lat); secLat = 1/cosLat
    VII = tanLat/(2*rho*nu)
    VIII = tanLat/(24*rho*nu**3)*(5+3*tanLat**2+eta2-9*tanLat**2*eta2)
    IX = tanLat/(720*rho*nu**5)*(61+90*tanLat**2+45*tanLat**4)
    X = secLat/nu
    XI = secLat/(6*nu**3)*(nu/rho+2*tanLat**2)
    XII = secLat/(120*nu**5)*(5+28*tanLat**2+24*tanLat**4)
    XIIA = secLat/(5040*nu**7)*(61+662*tanLat**2+1320*tanLat**4+720*tanLat**6)
    dE = E - E0
    lat = lat - VII*dE**2 + VIII*dE**4 - IX*dE**6
    lon = lon0 + X*dE - XI*dE**3 + XII*dE**5 - XIIA*dE**7
    # to cartesian (Airy)
    H = 0
    sl, cl = math.sin(lat), math.cos(lat)
    nu = a/math.sqrt(1-e2*sl*sl)
    x1 = (nu+H)*cl*math.cos(lon); y1 = (nu+H)*cl*math.sin(lon); z1 = ((1-e2)*nu+H)*sl
    # Helmert OSGB36 -> WGS84
    tx, ty, tz = 446.448, -125.157, 542.060
    s = -20.4894e-6
    rx, ry, rz = [math.radians(v/3600) for v in (0.1502, 0.2470, 0.8421)]
    x2 = tx + (1+s)*x1 - rz*y1 + ry*z1
    y2 = ty + rz*x1 + (1+s)*y1 - rx*z1
    z2 = tz - ry*x1 + rx*y1 + (1+s)*z1
    a2, b2 = 6378137.0, 6356752.3141
    e22 = 1 - (b2*b2)/(a2*a2)
    p = math.sqrt(x2*x2+y2*y2)
    lat = math.atan2(z2, p*(1-e22)); latold = 2*math.pi
    while abs(lat-latold) > 1e-16:
        latold = lat
        nu2 = a2/math.sqrt(1-e22*math.sin(lat)**2)
        lat = math.atan2(z2+e22*nu2*math.sin(lat), p)
    lon = math.atan2(y2, x2)
    return math.degrees(lat), math.degrees(lon)

def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None

src, dst = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, read_only=True); ws = wb.active
rows = ws.iter_rows(values_only=True); h = list(next(rows))
idx = {k: i for i, k in enumerate(h)}
cost_key = [k for k in h if k.startswith('IncidentNotionalCost')][0]
out = open(dst, 'w', newline='', encoding='utf-8'); w = csv.writer(out)
w.writerow(['date_time', 'animal', 'property_category', 'service_type', 'borough', 'pump_hours', 'notional_cost_gbp', 'latitude', 'longitude'])
kept = 0; maxerr = 0
for r in rows:
    g = lambda k: r[idx[k]]
    E, N = num(g('Easting_rounded')), num(g('Northing_rounded'))
    if not E or not N: continue
    lat, lon = bng_to_wgs84(E, N)
    la, lo = num(g('Latitude')), num(g('Longitude'))
    if la and lo and la != 0:
        maxerr = max(maxerr, abs(la-lat)*111000, abs(lo-lon)*70000)
    dt = g('DateTimeOfCall')
    w.writerow([dt.strftime('%Y-%m-%dT%H:%M') if hasattr(dt, 'strftime') else dt,
                (g('AnimalGroupParent') or '').strip().capitalize(),
                (g('PropertyCategory') or '').strip(),
                (g('SpecialServiceTypeCategory') or '').strip(),
                (g('Borough') or '').strip().title(),
                num(g('PumpHoursTotal')) if num(g('PumpHoursTotal')) is not None else '',
                num(g(cost_key)) if num(g(cost_key)) is not None else '',
                round(lat, 5), round(lon, 5)])
    kept += 1
print('kept', kept, 'max deviation vs published lat/lon (m, includes 50m rounding):', round(maxerr))

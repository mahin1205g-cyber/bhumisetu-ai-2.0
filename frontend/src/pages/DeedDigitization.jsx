import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check, CircleAlert, Download, Eye, FileText, Pencil, LoaderCircle, Plus,
  Printer, ScanLine, ShieldAlert, Trash2, UploadCloud, Share2, QrCode,
  Clock3, CircleCheck, XCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Input from '../components/Input';
import LocationCombobox, { displayLocationName } from '../components/LocationCombobox';
import PageHeader from '../components/PageHeader';
import DigitalDeedViewModal from '../components/DigitalDeedViewModal';

const EMPTY_FORM = {
  deed_no: '', reg_year: '', deed_type: '', reg_date: '', sub_registry_office: '',
  division: '', district: '', upazila: '', union_ward: '', mouza: '', plot_id: '',
  khatian_no: '', seller_name: '', buyer_name: '', area: '', area_unit: 'shotok',
  price: '', previous_owner: '', current_owner: '', land_class: '',
  land_description: '', boundary_information: '',
};

const LOCATION_MATCH = (item, value) => {
  const normalize = (text) => String(text || '').trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
  const target = normalize(value);
  return [item?.name_bn, item?.name_en, item?.code].some((name) => normalize(name) === target);
};

const numericFromOcr = (value) => {
  const western = String(value || '').replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit))).replace(/,/g, '');
  return western.match(/-?\d+(?:\.\d+)?/)?.[0] || '';
};

const isoDateFromOcr = (value) => {
  const text = String(value || '').replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit))).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!match) return '';
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]);
  // Interpret day/month/year only where the source is unambiguous.
  if (first > 12 && second <= 12) return `${year}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`;
  if (second > 12 && first <= 12) return `${year}-${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}`;
  return '';
};

export default function DeedDigitization({ setActiveTab, navigateBack, initialDigitalDeedId, onDigitalDeedOpened, initialApplicationId, onApplicationOpened }) {
  const { lang, t, user } = useApp();
  const bn = lang === 'bn';
  const [form, setForm] = useState(EMPTY_FORM);
  const [deedTypes, setDeedTypes] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [mouzas, setMouzas] = useState([]);
  const [unions, setUnions] = useState([]);
  const [divisionId, setDivisionId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [locationType, setLocationType] = useState('upazila');
  const [mouzaId, setMouzaId] = useState('');
  const [unionId, setUnionId] = useState('');
  const [mouzaMode, setMouzaMode] = useState('catalog');
  const [scanFile, setScanFile] = useState(null);
  const [scanToken, setScanToken] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [useAi, setUseAi] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [additionalParties, setAdditionalParties] = useState([]);
  const [additionalParcels, setAdditionalParcels] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [records, setRecords] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [assignmentSelections, setAssignmentSelections] = useState({});
  const [assigningId, setAssigningId] = useState(null);
  const [recordCounts, setRecordCounts] = useState({});
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [listError, setListError] = useState('');
  const [selectedPrint, setSelectedPrint] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingEntryMethod, setEditingEntryMethod] = useState('manual');
  const [previewUrl, setPreviewUrl] = useState('');
  const [digitalDeeds, setDigitalDeeds] = useState([]);
  const [qrImages, setQrImages] = useState({});
  const [selectedDigitalView, setSelectedDigitalView] = useState(null);
  const isStaff = ['officer', 'admin'].includes(user?.role);

  useEffect(() => {
    if (user?.role !== 'admin') { setOfficers([]); return undefined; }
    let active = true;
    api.listDigitizationOfficers()
      .then((response) => { if (active) setOfficers(response.items || []); })
      .catch((reason) => { if (active) setListError(reason.message || (bn ? 'কর্মকর্তার তালিকা পাওয়া যায়নি।' : 'Could not load officers.')); });
    return () => { active = false; };
  }, [user?.role, bn]);

  useEffect(() => {
    let active = true;
    Promise.all([api.getVerificationDeedTypes(), api.getLocationDivisions()]).then(([types, divisionsResponse]) => {
      if (!active) return;
      setDeedTypes(types.items || []);
      setDivisions(divisionsResponse.items || []);
    }).catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setDistricts([]);
    if (divisionId) api.getLocationDistricts({ divisionId, limit: 500 }).then((response) => {
      if (active) setDistricts(response.items || []);
    }).catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [divisionId]);

  useEffect(() => {
    let active = true;
    setLocations([]);
    if (districtId) {
      const request = locationType === 'upazila' ? api.getLocationUpazilas(districtId) : api.getLocationThanas(districtId);
      request.then((response) => { if (active) setLocations(response.items || []); })
        .catch((reason) => { if (active) setError(reason.message); });
    }
    return () => { active = false; };
  }, [districtId, locationType]);

  useEffect(() => {
    let active = true;
    setMouzas([]);
    setUnions([]);
    if (!locationId) return () => { active = false; };
    const mouzaRequest = locationType === 'upazila'
      ? api.getLocationMouzas({ upazilaId: locationId })
      : api.getLocationMouzas({ thanaId: locationId });
    mouzaRequest.then((response) => {
      if (!active) return;
      const items = response.items || [];
      setMouzas(items);
      if (!items.length) { setMouzaId(''); setMouzaMode('manual'); }
    }).catch(() => { if (active) { setMouzas([]); setMouzaId(''); setMouzaMode('manual'); } });
    if (locationType === 'upazila') api.getLocationUnions(locationId).then((response) => {
      if (active) setUnions(response.items || []);
    }).catch(() => { if (active) setUnions([]); });
    return () => { active = false; };
  }, [locationId, locationType]);

  useEffect(() => {
    if (!scanFile) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(scanFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [scanFile]);

  useEffect(() => {
    const token = scanToken;
    return () => {
      if (token) api.discardDigitizationScan(token).catch(() => {});
    };
  }, [scanToken]);

  const loadRecords = useCallback(async (requestedPage = page) => {
    setBusy('list');
    setListError('');
    try {
      const response = await api.listDigitizationApplications({ page: requestedPage, pageSize: 20, staffQueue: isStaff });
      setRecords(response.items || []);
      setAssignmentSelections((previous) => {
        const next = { ...previous };
        for (const item of response.items || []) next[item.id] = item.assigned_officer_id ? String(item.assigned_officer_id) : '';
        return next;
      });
      setRecordCounts(response.counts || {});
      setTotalRecords(Number(response.total || 0));
      setPage(Number(response.page || requestedPage));
    } catch (reason) {
      setListError(reason.message);
    } finally { setBusy(''); }
  }, [isStaff]);

  useEffect(() => {
    if (isStaff) loadRecords(1);
    api.listDigitalDeeds(isStaff).then((response) => setDigitalDeeds(response.items || [])).catch(() => setDigitalDeeds([]));
  }, [loadRecords]);

  useEffect(() => {
    let active = true;
    const entries = digitalDeeds.filter((deed) => deed.verification_token).map(async (deed) => {
      const url = `${window.location.origin}/#verify-deed/${encodeURIComponent(deed.verification_token)}`;
      try { return [deed.id, await QRCode.toDataURL(url, { width: 180, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })]; }
      catch { return [deed.id, '']; }
    });
    Promise.all(entries).then((items) => { if (active) setQrImages(Object.fromEntries(items)); });
    return () => { active = false; };
  }, [digitalDeeds]);

  useEffect(() => {
    if (!initialDigitalDeedId) return undefined;
    let active = true;
    api.getDigitalDeed(initialDigitalDeedId)
      .then((deed) => {
        if (!active) return;
        if (deed.record_status !== 'active') {
          setListError(bn ? 'এই ডিজিটাল দলিলটি বর্তমানে সক্রিয় নয়।' : 'This digital deed is not currently active.');
          return;
        }
        setSelectedDigitalView(deed);
      })
      .catch((reason) => {
        if (active) setListError(reason.message || (bn ? 'অনুমোদিত ডিজিটাল দলিলটি খোলা যায়নি।' : 'Could not open the approved digital deed.'));
      })
      .finally(() => { if (active) onDigitalDeedOpened?.(); });
    return () => { active = false; };
  }, [initialDigitalDeedId]);

  useEffect(() => {
    if (!initialApplicationId || !isStaff) return undefined;
    let active = true;
    api.getDigitizationApplication(initialApplicationId)
      .then((application) => { if (active) setSelectedDetail(application); })
      .catch((reason) => { if (active) setListError(reason.message || (bn ? 'আবেদনটি খোলা যায়নি।' : 'Could not open this application.')); })
      .finally(() => { if (active) onApplicationOpened?.(); });
    return () => { active = false; };
  }, [initialApplicationId, isStaff]);

  const changeForm = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
    setNotice('');
  };

  const selectDivision = (value) => {
    const selected = divisions.find((item) => String(item.id) === String(value));
    setDivisionId(value);
    setDistrictId(''); setLocationId(''); setMouzaId(''); setUnionId('');
    setMouzaMode('catalog');
    setForm((previous) => ({ ...previous, division: selected ? displayLocationName(selected, 'bn') : '', district: '', upazila: '', mouza: '', union_ward: '' }));
  };

  const selectDistrict = (selected) => {
    setDistrictId(selected ? String(selected.id) : '');
    setLocationId(''); setMouzaId(''); setUnionId('');
    setMouzaMode('catalog');
    setForm((previous) => ({ ...previous, district: selected ? displayLocationName(selected, 'bn') : '', upazila: '', mouza: '', union_ward: '' }));
  };

  const selectLocation = (selected) => {
    setLocationId(selected ? String(selected.id) : '');
    setMouzaId(''); setUnionId(''); setMouzaMode('catalog');
    setForm((previous) => ({ ...previous, upazila: selected ? displayLocationName(selected, 'bn') : '', mouza: '', union_ward: '' }));
  };

  const applyExtractedLocations = async (fields) => {
    if (!fields?.district) return;
    try {
      const [divResponse, districtResponse] = await Promise.all([
        api.getLocationDivisions(), api.getLocationDistricts({ q: fields.district, limit: 500 }),
      ]);
      const matches = (districtResponse.items || []).filter((item) => LOCATION_MATCH(item, fields.district));
      if (matches.length !== 1) return;
      const district = matches[0];
      const division = (divResponse.items || []).find((item) => String(item.id) === String(district.division_id));
      if (!division) return;
      const [districtsResponse, upazilaResponse, thanaResponse] = await Promise.all([
        api.getLocationDistricts({ divisionId: division.id, limit: 500 }),
        fields.upazila ? api.getLocationUpazilas(district.id, { q: fields.upazila, limit: 500 }) : Promise.resolve({ items: [] }),
        fields.upazila ? api.getLocationThanas(district.id, { q: fields.upazila, limit: 500 }) : Promise.resolve({ items: [] }),
      ]);
      const upazilaMatches = (upazilaResponse.items || []).filter((item) => LOCATION_MATCH(item, fields.upazila));
      const thanaMatches = (thanaResponse.items || []).filter((item) => LOCATION_MATCH(item, fields.upazila));
      const useThana = fields.upazila_type === 'police_thana' && thanaMatches.length === 1;
      const location = useThana ? thanaMatches[0] : upazilaMatches.length === 1 ? upazilaMatches[0] : thanaMatches.length === 1 ? thanaMatches[0] : null;
      setDivisionId(String(division.id));
      setDistricts(districtsResponse.items || []);
      setDistrictId(String(district.id));
      if (location) {
        const nextType = useThana || (!upazilaMatches.length && thanaMatches.length === 1) ? 'police_thana' : 'upazila';
        setLocationType(nextType);
        setLocations(nextType === 'police_thana' ? (thanaResponse.items || []) : (upazilaResponse.items || []));
        setLocationId(String(location.id));
        const mouzaResponse = nextType === 'upazila'
          ? await api.getLocationMouzas({ upazilaId: location.id })
          : await api.getLocationMouzas({ thanaId: location.id });
        const matchedMouza = (mouzaResponse.items || []).filter((item) => LOCATION_MATCH(item, fields.mouza));
        setMouzas(mouzaResponse.items || []);
        if (matchedMouza.length === 1) {
          setMouzaId(String(matchedMouza[0].id));
          setMouzaMode('catalog');
          setForm((previous) => ({ ...previous, division: displayLocationName(division, 'bn'), district: displayLocationName(district, 'bn'), upazila: displayLocationName(location, 'bn'), mouza: displayLocationName(matchedMouza[0], 'bn') }));
        } else {
          setMouzaId(''); setMouzaMode('manual');
          setForm((previous) => ({ ...previous, division: displayLocationName(division, 'bn'), district: displayLocationName(district, 'bn'), upazila: displayLocationName(location, 'bn'), mouza: fields.mouza || previous.mouza }));
        }
        return;
      }
      setLocationId(''); setMouzaId(''); setUnionId('');
      setForm((previous) => ({ ...previous, division: displayLocationName(division, 'bn'), district: displayLocationName(district, 'bn') }));
    } catch {
      // OCR text is still shown to the reviewer; official IDs remain unselected until picked.
    }
  };

  const scanDocument = async () => {
    setError(''); setNotice(''); setScanResult(null); setScanToken('');
    if (!scanFile) { setError(t('digitizationFileRequired')); return; }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if ((!allowed.includes(scanFile.type) && !/\.(pdf|jpe?g|png)$/i.test(scanFile.name)) || scanFile.size > 10 * 1024 * 1024) {
      setError(bn ? 'PDF, JPG বা PNG দিন; ফাইল ১০ MB-এর মধ্যে হতে হবে।' : 'Choose a PDF, JPG, or PNG file no larger than 10 MB.');
      return;
    }
    setBusy('scan');
    try {
      const payload = new FormData();
      payload.append('file', scanFile);
      payload.append('use_ai', String(useAi));
      const result = await api.scanDigitizationDocument(payload);
      setScanResult(result);
      setScanToken(result.scan_token || '');
      const extracted = result.extracted_fields || {};
      setForm((previous) => {
        const next = { ...previous };
        const fields = ['deed_no', 'deed_type', 'sub_registry_office', 'plot_id', 'khatian_no', 'seller_name', 'buyer_name', 'previous_owner', 'current_owner', 'land_class', 'land_description', 'boundary_information'];
        fields.forEach((key) => { if (!next[key] && extracted[key]) next[key] = extracted[key]; });
        if (!next.reg_year && extracted.reg_year) next.reg_year = String(extracted.reg_year);
        if (!next.reg_date && extracted.reg_date) next.reg_date = isoDateFromOcr(extracted.reg_date);
        if (!next.area && extracted.area) next.area = numericFromOcr(extracted.area);
        if (!next.price && extracted.price) next.price = numericFromOcr(extracted.price);
        if (!next.mouza && extracted.mouza) next.mouza = extracted.mouza;
        return next;
      });
      await applyExtractedLocations(extracted);
      setReviewConfirmed(false);
    } catch (reason) {
      setError(reason.message);
    } finally { setBusy(''); }
  };

  const applySuggestion = (field, suggestion) => {
    setForm((previous) => ({ ...previous, [field]: suggestion.value }));
    if (['district', 'upazila', 'mouza'].includes(field)) {
      setForm((previous) => ({ ...previous, [field]: suggestion.value }));
      if (field === 'district') { setDistrictId(''); setLocationId(''); }
      if (field === 'upazila') setLocationId('');
      if (field === 'mouza') { setMouzaId(''); setMouzaMode('manual'); }
    }
  };

  const saveRecord = async (event) => {
    event.preventDefault();
    setError(''); setNotice('');
    if (!divisionId || !districtId || !locationId) {
      setError(bn ? 'বিভাগ, জেলা ও উপজেলা/থানা সরকারি তালিকা থেকে বাছুন।' : 'Choose a Division, District, and Upazila/Thana from the official lists.');
      return;
    }
    if (mouzaMode === 'catalog' && !mouzaId && mouzas.length) {
      setError(bn ? 'তালিকা থেকে মৌজা বাছুন, অথবা হাতে দেওয়ার মোড চালু করুন।' : 'Choose a Mouza from the list or switch to manual entry.');
      return;
    }
    if (scanFile && !scanToken) {
      setError(bn ? 'সংরক্ষণের আগে নির্বাচিত দলিলটি OCR করুন।' : 'Run OCR on the selected deed before saving it.');
      return;
    }
    if (!reviewConfirmed) {
      setError(bn ? 'সংরক্ষণের আগে মূল দলিল দেখে তথ্য পর্যালোচনার নিশ্চয়তা দিন।' : 'Confirm that you reviewed the values against the original deed.');
      return;
    }
    setBusy('save');
    try {
      const payload = {
        ...form,
        reg_year: Number(form.reg_year),
        area: Number(form.area),
        price: Number(form.price),
        division_id: Number(divisionId),
        district_id: Number(districtId),
        location_type: locationType,
        location_id: Number(locationId),
        union_id: unionId ? Number(unionId) : null,
        mouza_id: mouzaId ? Number(mouzaId) : null,
        entry_method: editingId ? editingEntryMethod : scanToken ? 'ocr' : 'manual',
        scan_token: editingId ? null : scanToken || null,
        review_confirmed: true,
        ai_extraction_used: scanResult?.ai_status === 'available',
        additional_parties: additionalParties.filter((party) => party.name.trim()).map((party) => ({
          ...party,
          ownership_share: party.ownership_share === '' ? null : Number(party.ownership_share),
        })),
        additional_parcels: additionalParcels.filter((parcel) => parcel.plot_id || parcel.khatian_no || parcel.mouza),
      };
      const result = editingId
        ? await api.resubmitDigitizationApplication(editingId, payload)
        : await api.submitDigitizationApplication(payload);
      setNotice(`${bn ? 'ট্র্যাকিং নম্বর' : 'Tracking ID'}: ${result.tracking_id} · ${result.message_bn && bn ? result.message_bn : result.message_en || t('digitizationSaved')}`);
      setScanToken(''); setScanResult(null); setScanFile(null); setReviewConfirmed(false);
      setEditingId(null); setEditingEntryMethod('manual'); setForm(EMPTY_FORM);
      setAdditionalParties([]); setAdditionalParcels([]);
      await loadRecords(1);
    } catch (reason) { setError(reason.message); }
    finally { setBusy(''); }
  };

  const downloadOriginal = async (record, documentId = null) => {
    try {
      const detail = await api.getDigitizationApplication(record.id);
      const selected = detail.documents?.find((doc) => String(doc.id) === String(documentId)) || detail.documents?.[0];
      if (!selected) throw new Error(bn ? 'এই আবেদনের সঙ্গে কোনো মূল ফাইল নেই।' : 'No original document is attached to this application.');
      const blob = await api.downloadDigitizationApplicationDocument(record.id, selected.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${record.tracking_id || 'application'}-document`;
      anchor.click(); URL.revokeObjectURL(url);
    } catch (reason) { setListError(reason.message); }
  };

  const printRecord = async (record) => {
    try {
      const full = await api.getDigitalDeed(record.id);
      const verificationUrl = `${window.location.origin}/#verify-deed/${encodeURIComponent(full.verification_token)}`;
      const qr = await QRCode.toDataURL(verificationUrl, { width: 220, margin: 1 });
      setSelectedPrint({ ...full, verification_url: verificationUrl, qr_data_url: qr });
      window.setTimeout(() => window.print(), 120);
    } catch (reason) { setListError(reason.message); }
  };

  const viewDigitalDeed = async (record) => {
    try { setSelectedDigitalView(await api.getDigitalDeed(record.id)); }
    catch (reason) { setListError(reason.message); }
  };

  const viewRecord = async (record) => {
    setListError('');
    try {
      setSelectedDetail(await api.getDigitizationApplication(record.id));
    } catch (reason) { setListError(reason.message); }
  };

  const editRecord = async (record) => {
    setError(''); setNotice(''); setListError(''); setBusy('detail');
    try {
      const detail = await api.getDigitizationApplication(record.id);
      if (detail.status !== 'correction_required') throw new Error(bn ? 'শুধু সংশোধন চাওয়া আবেদন সম্পাদনা করা যাবে।' : 'Only applications marked for correction can be edited.');
      const data = detail.deed_data || {};
      const supplemental = data.supplemental_fields || {};
      setEditingId(detail.id); setEditingEntryMethod(detail.entry_method || 'manual');
      setSelectedDetail(null); setScanFile(null); setScanToken(''); setScanResult(null);
      setForm({
        ...EMPTY_FORM,
        deed_no: data.deed_no || '', reg_year: String(data.reg_year || ''),
        deed_type: data.deed_type || '', reg_date: data.reg_date || '',
        sub_registry_office: data.sub_registry_office || '', division: data.division || '',
        district: data.district || '', upazila: data.upazila || '', mouza: data.mouza || '',
        union_ward: data.union_ward || '', plot_id: data.plot_id || '',
        khatian_no: data.khatian_no || '', seller_name: data.seller_name || '',
        buyer_name: data.buyer_name || '', area: String(data.area ?? ''),
        area_unit: supplemental.area_unit || 'shotok', price: String(data.price ?? ''),
        previous_owner: supplemental.previous_owner || '', current_owner: supplemental.current_owner || '',
        land_class: supplemental.land_class || '', land_description: supplemental.land_description || '',
        boundary_information: supplemental.boundary_information || '',
      });
      setAdditionalParties(data.additional_parties || []);
      setAdditionalParcels((data.additional_parcels || []).map((parcel) => ({ ...parcel, area: String(parcel.area ?? ''), price: String(parcel.price ?? '') })));
      setReviewConfirmed(false);
      await applyExtractedLocations({ district: data.district, upazila: data.upazila, mouza: data.mouza });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (reason) { setListError(reason.message); }
    finally { setBusy(''); }
  };

  const decideRecord = async (record, action) => {
    const note = ['correction_required', 'rejected', 'cancelled'].includes(action)
      ? window.prompt(bn ? 'কারণ বা প্রয়োজনীয় সংশোধন লিখুন:' : 'Enter the reason or requested correction:')
      : window.prompt(bn ? 'অনুমোদনের নোট (ঐচ্ছিক):' : 'Approval note (optional):') || '';
    if (note === null || (['correction_required', 'rejected', 'cancelled'].includes(action) && !note.trim())) return;
    try {
      const result = await api.decideDigitizationApplication(record.id, action, note);
      setNotice(result.digital_deed_id ? `${bn ? 'ডিজিটাল দলিল আইডি' : 'Digital deed ID'}: ${result.digital_deed_id}` : (bn ? 'আবেদনের অবস্থা হালনাগাদ হয়েছে।' : 'Application status updated.'));
      await loadRecords();
      if (result.digital_deed_id) {
        const deeds = await api.listDigitalDeeds(isStaff);
        setDigitalDeeds(deeds.items || []);
      }
    } catch (reason) { setListError(reason.message); }
  };

  const assignOfficer = async (record) => {
    const selectedOfficer = assignmentSelections[record.id] ?? (record.assigned_officer_id ? String(record.assigned_officer_id) : '');
    setAssigningId(record.id);
    setListError('');
    try {
      const result = await api.assignDigitizationApplication(record.id, selectedOfficer ? Number(selectedOfficer) : null);
      setNotice(result.assigned_officer_id
        ? (bn ? 'আবেদনটি কর্মকর্তাকে দায়িত্ব দেওয়া হয়েছে।' : 'Application assigned to the officer.')
        : (bn ? 'কর্মকর্তার দায়িত্ব সরানো হয়েছে।' : 'Officer assignment removed.'));
      await loadRecords();
    } catch (reason) { setListError(reason.message || (bn ? 'দায়িত্ব দেওয়া যায়নি।' : 'Could not save the assignment.')); }
    finally { setAssigningId(null); }
  };

  const cancelApplication = async (record) => {
    if (!window.confirm(bn ? 'এই আবেদনটি বাতিল করবেন?' : 'Cancel this application?')) return;
    try { await api.cancelDigitizationApplication(record.id); await loadRecords(); }
    catch (reason) { setListError(reason.message); }
  };

  const shareDigitalDeed = async (record) => {
    const url = `${window.location.origin}/#verify-deed/${encodeURIComponent(record.verification_token)}`;
    try { await navigator.clipboard.writeText(url); setNotice(bn ? 'যাচাই লিংক কপি হয়েছে।' : 'Verification link copied.'); }
    catch { window.prompt(bn ? 'যাচাই লিংক কপি করুন:' : 'Copy verification link:', url); }
  };

  const revokeDigitalDeed = async (record) => {
    const reason = window.prompt(bn ? 'প্রত্যাহারের কারণ লিখুন:' : 'Enter the revocation reason:');
    if (!reason || reason.trim().length < 5) return;
    try { await api.revokeDigitalDeed(record.id, reason.trim()); const result = await api.listDigitalDeeds(true); setDigitalDeeds(result.items || []); setNotice(bn ? 'ডিজিটাল কপিটি প্রত্যাহার করা হয়েছে।' : 'Digital copy revoked.'); }
    catch (error) { setListError(error.message); }
  };

  const addApplicationDocument = async (applicationId, file) => {
    if (!file) return;
    setBusy('document'); setListError('');
    try {
      if (file.size > 10 * 1024 * 1024 || !/\.(pdf|jpe?g|png)$/i.test(file.name)) throw new Error(bn ? 'PDF, JPG বা PNG ফাইল ১০ MB-এর মধ্যে দিন।' : 'Choose a PDF, JPG, or PNG file no larger than 10 MB.');
      const payload = new FormData(); payload.append('file', file);
      await api.uploadDigitizationApplicationDocument(applicationId, payload);
      setSelectedDetail(await api.getDigitizationApplication(applicationId));
    } catch (reason) { setListError(reason.message); }
    finally { setBusy(''); }
  };

  const statItems = useMemo(() => [
    { key: 'total', title: bn ? 'মোট আবেদন' : 'Applications', value: totalRecords },
    { key: 'pending', title: bn ? 'পর্যালোচনায়' : 'In review', value: (recordCounts.submitted || 0) + (recordCounts.under_review || 0) + (recordCounts.resubmitted || 0) },
    { key: 'correction', title: bn ? 'সংশোধন প্রয়োজন' : 'Correction needed', value: recordCounts.correction_required || 0 },
    { key: 'completed', title: bn ? 'সম্পন্ন' : 'Completed', value: recordCounts.completed || 0 },
    { key: 'rejected', title: bn ? 'প্রত্যাখ্যাত' : 'Rejected', value: recordCounts.rejected || 0 },
  ], [recordCounts, t, bn, totalRecords]);

  const labelClass = 'mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200';
  const inputClass = 'gov-input';
  const label = (text, required = false) => <span>{text}{required && <span className="ml-1 text-rose-500">*</span>}</span>;
  const applicationStatusLabel = (status) => ({
    submitted: bn ? 'জমা হয়েছে' : 'Submitted',
    under_review: bn ? 'পর্যালোচনায়' : 'Under review',
    correction_required: bn ? 'সংশোধন প্রয়োজন' : 'Correction required',
    resubmitted: bn ? 'পুনরায় জমা' : 'Resubmitted',
    approved: bn ? 'অনুমোদিত' : 'Approved',
    digitization_processing: bn ? 'ডিজিটাল কপি তৈরি হচ্ছে' : 'Creating digital copy',
    completed: bn ? 'সম্পন্ন' : 'Completed',
    rejected: bn ? 'প্রত্যাখ্যাত' : 'Rejected',
    cancelled: bn ? 'বাতিল' : 'Cancelled',
  }[status] || status);
  const renderField = ({ name, title, type = 'text', required = false, placeholder = '', min, step, options }) => (
    <div className="min-w-0">
      <label className={labelClass} htmlFor={`digitize-${name}`}>{label(title, required)}</label>
      {options ? (
        <Input id={`digitize-${name}`} as="select" name={name} value={form[name]} onChange={changeForm} className="gov-select" required={required}>
          <option value="">{placeholder || (bn ? 'বাছুন' : 'Choose')}</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Input>
      ) : (
        <Input id={`digitize-${name}`} name={name} type={type} value={form[name]} onChange={changeForm} className={inputClass} required={required} placeholder={placeholder} min={min} step={step} />
      )}
    </div>
  );

  return (
    <div className="gov-container deed-digitization-page py-5 sm:py-7 space-y-5">
      <style>{`@media print { body * { visibility: hidden !important; } .deed-print-card, .deed-print-card * { visibility: visible !important; } .deed-print-card { display:block !important; position:absolute; inset:0 auto auto 0; width:100%; background:white; color:#111827; padding:28px; } @page { size:A4; margin:15mm; } }`}</style>
      <PageHeader
        title={t('digitizationTitle')}
        subtitle={t('digitizationSubtitle')}
        icon={FileText}
        badge={bn ? 'পর্যালোচনা আবশ্যক' : 'Review required'}
        badgeColor="blue"
        setActiveTab={setActiveTab}
        onBack={navigateBack}
        fallbackTab="deed-verify"
      />

      <DigitalDeedViewModal
        deed={selectedDigitalView}
        qr={selectedDigitalView ? qrImages[selectedDigitalView.id] : ''}
        onClose={() => setSelectedDigitalView(null)}
        onShare={() => selectedDigitalView && shareDigitalDeed(selectedDigitalView)}
        onPrint={() => selectedDigitalView && printRecord(selectedDigitalView)}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {statItems.map((item) => <div key={item.key} className="gov-card p-4 border border-slate-200/80 dark:border-slate-700"><p className="text-xs text-slate-500">{item.title}</p><p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{item.value}</p></div>)}
      </div>

      {(error || notice) && <div role={error ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'}`}>{error || notice}</div>}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
        <section className="gov-card min-w-0 space-y-5 p-4 sm:p-6">
          <div className="flex items-start gap-3 border-b border-slate-200 pb-4 dark:border-slate-700">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><ScanLine className="h-5 w-5" /></div>
            <div><h2 className="font-bold text-slate-900 dark:text-white">{t('digitizationScanner')}</h2><p className="mt-1 text-xs text-slate-500">{bn ? 'বিদ্যমান backend OCR (Tesseract + PDF text extraction) ব্যবহার করা হচ্ছে।' : 'Uses the existing backend OCR (Tesseract + searchable PDF text extraction).'}</p></div>
          </div>

          <div className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${dragActive ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30' : 'border-slate-300 dark:border-slate-700'}`}
            onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => { event.preventDefault(); setDragActive(false); if (event.dataTransfer.files?.[0]) { setScanFile(event.dataTransfer.files[0]); setScanToken(''); setScanResult(null); } }}>
            <UploadCloud className="mx-auto mb-2 h-8 w-8 text-emerald-800 dark:text-emerald-300" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{scanFile?.name || t('digitizationUpload')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('digitizationUploadHint')}</p>
            <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {bn ? 'ফাইল বাছুন' : 'Browse files'}
              <input type="file" disabled={Boolean(editingId)} accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setScanFile(file); setScanToken(''); setScanResult(null); } event.target.value = ''; }} />
            </label>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
            <input type="checkbox" disabled={Boolean(editingId)} checked={useAi} onChange={(event) => setUseAi(event.target.checked)} className="mt-0.5 accent-emerald-700" />
            <span><strong>{t('digitizationUseAi')}</strong><span className="mt-1 block leading-relaxed">{t('digitizationAiPrivacy')}</span></span>
          </label>

          <Button type="button" onClick={scanDocument} disabled={Boolean(editingId) || busy === 'scan' || !scanFile} className="gov-btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-60">
            {busy === 'scan' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}{busy === 'scan' ? t('digitizationScanning') : t('digitizationScan')}
          </Button>

          {scanResult && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/60 dark:bg-blue-950/20">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('digitizationExtracted')}</h3><p className="mt-1 text-xs text-slate-500">{scanResult.message_bn && bn ? scanResult.message_bn : scanResult.message_en}</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-900">{scanResult.recognized_field_count || 0} {bn ? 'টি field' : 'fields'}</span></div>
            {scanResult.ai_status && scanResult.ai_status !== 'not_requested' && <p className="text-xs text-slate-600 dark:text-slate-300">{scanResult.ai_model || 'Gemini'} · {scanResult.ai_status}</p>}
            {Object.keys(scanResult.ai_suggestions || {}).length > 0 ? <div className="space-y-2"><h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">{t('digitizationSuggestions')}</h4>{Object.entries(scanResult.ai_suggestions).map(([key, suggestion]) => <div key={key} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-white p-2.5 text-xs dark:bg-slate-900"><div className="min-w-0"><p className="font-semibold text-slate-700 dark:text-slate-200">{t(key) || key}: {suggestion.value}</p><p className="mt-1 text-slate-500">{t('digitizationEvidence')}: “{suggestion.evidence}”</p></div><Button type="button" onClick={() => applySuggestion(key, suggestion)} className="rounded-md border border-emerald-300 px-2 py-1 text-emerald-800 dark:border-emerald-800 dark:text-emerald-300">{bn ? 'ব্যবহার' : 'Use'}</Button></div>)}</div> : useAi && <p className="text-xs text-slate-600 dark:text-slate-300">{t('digitizationNoAi')}</p>}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{Object.entries(scanResult.extracted_fields || {}).filter(([, value]) => value !== '' && value !== null && value !== undefined && typeof value !== 'object').map(([key, value]) => <div key={key} className="rounded-lg bg-white p-2 dark:bg-slate-900"><p className="text-[10px] text-slate-500">{t(key) || key}</p><p className="break-words text-xs font-medium text-slate-800 dark:text-slate-100">{String(value)}</p></div>)}</div>
            {(scanResult.ocr_warnings || []).map((warning) => <p key={warning} className="text-xs text-amber-700 dark:text-amber-300">{warning}</p>)}
            {scanResult.raw_text_preview && <details><summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">{bn ? 'OCR-এ পড়া টেক্সটের নমুনা' : 'OCR text preview'}</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-2 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">{scanResult.raw_text_preview}</pre></details>}
          </div>}

          <form onSubmit={saveRecord} className="space-y-5 border-t border-slate-200 pt-5 dark:border-slate-700">
            <div><h2 className="font-bold text-slate-900 dark:text-white">{editingId ? t('digitizationEditRecord') : t('digitizationManual')}</h2><p className="mt-1 text-xs text-slate-500">{bn ? 'OCR না করেও তথ্য হাতে পূরণ করুন। জমা দিলে আবেদন হিসেবে থাকবে; কর্মকর্তা অনুমোদন না করা পর্যন্ত মূল দলিল ডেটাবেজে যাবে না।' : 'Complete the fields manually if needed. Submission creates an application; the canonical deeds database is updated only after staff approval.'}</p>{editingId && <p className="mt-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">{t('digitizationOriginalPreserved')}</p>}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {renderField({ name: 'deed_no', title: t('deedNo'), required: true })}
              {renderField({ name: 'reg_year', title: t('regYear'), type: 'number', min: '1800', required: true })}
              {renderField({ name: 'deed_type', title: t('deedType'), required: true, options: deedTypes.map((item) => ({ value: item.code, label: bn ? item.name_bn : item.name_en })), placeholder: bn ? 'দলিলের ধরন বাছুন' : 'Select deed type' })}
              {renderField({ name: 'reg_date', title: t('regDate'), type: 'date', required: true })}
              {renderField({ name: 'sub_registry_office', title: t('subRegistryOffice'), required: true })}
              <div>
                <label className={labelClass} htmlFor="digitize-division">{label(bn ? 'বিভাগ' : 'Division', true)}</label>
                <Input id="digitize-division" as="select" value={divisionId} onChange={(event) => selectDivision(event.target.value)} className="gov-select" required>
                  <option value="">{bn ? 'বিভাগ বাছুন' : 'Choose division'}</option>{divisions.map((item) => <option key={item.id} value={item.id}>{displayLocationName(item, 'bn')}</option>)}
                </Input>
              </div>
              <div>
                <label className={labelClass}>{label(t('district'), true)}</label>
                <LocationCombobox id="digitize-district" value={form.district} selectedKey={districtId} items={districts} lang="bn" disabled={!divisionId} selectionOnly nativeSelect className="gov-input" placeholder={bn ? 'তালিকা থেকে জেলা বাছুন' : 'Choose a district'} emptyText={bn ? 'জেলা মেলেনি' : 'No district found'} onTextChange={() => selectDistrict(null)} onSelect={selectDistrict} />
              </div>
              <div>
                <label className={labelClass} htmlFor="digitize-location-type">{bn ? 'এলাকার ধরন' : 'Location type'}</label>
                <Input id="digitize-location-type" as="select" value={locationType} onChange={(event) => { setLocationType(event.target.value); setLocationId(''); setMouzaId(''); setUnionId(''); setForm((previous) => ({ ...previous, upazila: '', mouza: '', union_ward: '' })); }} className="gov-select">
                  <option value="upazila">{bn ? 'উপজেলা' : 'Upazila'}</option><option value="police_thana">{bn ? 'মেট্রোপলিটন থানা' : 'Metropolitan Thana'}</option>
                </Input>
              </div>
              <div>
                <label className={labelClass}>{label(locationType === 'upazila' ? t('upazila') : (bn ? 'থানা' : 'Thana'), true)}</label>
                <LocationCombobox id="digitize-location" value={form.upazila} selectedKey={locationId} items={locations} lang="bn" disabled={!districtId} selectionOnly nativeSelect className="gov-input" placeholder={bn ? 'তালিকা থেকে বাছুন' : 'Choose from the list'} emptyText={bn ? 'তথ্য মেলেনি' : 'No location found'} onTextChange={() => selectLocation(null)} onSelect={selectLocation} />
              </div>
              <div>
                <label className={labelClass}>{bn ? 'ইউনিয়ন / ওয়ার্ড (ঐচ্ছিক)' : 'Union / Ward (optional)'}</label>
                {unions.length ? <LocationCombobox id="digitize-union" value={form.union_ward} selectedKey={unionId} items={unions} lang="bn" disabled={locationType !== 'upazila' || !locationId} selectionOnly nativeSelect className="gov-input" placeholder={bn ? 'তালিকা থেকে বাছুন' : 'Choose from the list'} emptyText={bn ? 'ইউনিয়ন মেলেনি' : 'No Union found'} onTextChange={() => { setUnionId(''); setForm((previous) => ({ ...previous, union_ward: '' })); }} onSelect={(item) => { setUnionId(String(item.id)); setForm((previous) => ({ ...previous, union_ward: displayLocationName(item, 'bn') })); }} /> : <Input id="digitize-union-manual" name="union_ward" value={form.union_ward} onChange={changeForm} disabled={!locationId} className="gov-input" placeholder={bn ? 'ইউনিয়ন / ওয়ার্ড লিখুন (ঐচ্ছিক)' : 'Enter Union / Ward (optional)'} />}
              </div>
              <div>
                <label className={labelClass}>{label(t('mouza'), true)}</label>
                <div className="mb-1 flex gap-2"><Button type="button" onClick={() => setMouzaMode('catalog')} disabled={!mouzas.length} className={`rounded-full border px-2.5 py-1 text-[11px] ${mouzaMode === 'catalog' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-300 text-slate-600'}`}>{bn ? 'তালিকা' : 'List'}</Button><Button type="button" onClick={() => { setMouzaMode('manual'); setMouzaId(''); }} className={`rounded-full border px-2.5 py-1 text-[11px] ${mouzaMode === 'manual' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-300 text-slate-600'}`}>{bn ? 'হাতে লিখুন' : 'Manual'}</Button></div>
                {mouzaMode === 'catalog' && mouzas.length ? <LocationCombobox id="digitize-mouza" value={form.mouza} selectedKey={mouzaId} items={mouzas} lang="bn" disabled={!locationId} selectionOnly nativeSelect className="gov-input" placeholder={bn ? 'তালিকা থেকে মৌজা বাছুন' : 'Choose a Mouza'} emptyText={bn ? 'মৌজা মেলেনি' : 'No Mouza found'} onTextChange={() => { setMouzaId(''); setForm((previous) => ({ ...previous, mouza: '' })); }} onSelect={(item) => { setMouzaId(String(item.id)); setForm((previous) => ({ ...previous, mouza: displayLocationName(item, 'bn') })); }} /> : <Input id="digitize-mouza-manual" name="mouza" value={form.mouza} onChange={changeForm} className="gov-input" placeholder={bn ? 'দলিলের মৌজার নাম লিখুন' : 'Enter the Mouza from the deed'} required />}
                <p className="mt-1 text-[10px] text-slate-500">{mouzaId ? (bn ? 'তালিকাভুক্ত মৌজা বাছা হয়েছে; মালিকানা যাচাই নয়।' : 'Catalog entry selected; this is not ownership verification.') : (bn ? 'হাতে দেওয়া মৌজার নাম সরকারি তালিকায় যাচাই করা নয়।' : 'Manual Mouza names are not verified against an official list.')}</p>
              </div>
              {renderField({ name: 'plot_id', title: t('plotNo'), required: true })}
              {renderField({ name: 'khatian_no', title: t('khatianNo'), required: true })}
              {renderField({ name: 'seller_name', title: t('sellerName'), required: true })}
              {renderField({ name: 'buyer_name', title: t('buyerName'), required: true })}
              {renderField({ name: 'area', title: t('landArea'), type: 'number', min: '0.0001', step: 'any', required: true })}
              {renderField({ name: 'area_unit', title: t('areaUnit'), options: [{ value: 'shotok', label: bn ? 'শতক' : 'Shotok' }, { value: 'acre', label: bn ? 'একর' : 'Acre' }, { value: 'decimal', label: bn ? 'ডেসিমেল' : 'Decimal' }, { value: 'other', label: bn ? 'অন্যান্য' : 'Other' }] })}
              {renderField({ name: 'price', title: t('price'), type: 'number', min: '0', step: 'any', required: true })}
              {renderField({ name: 'previous_owner', title: bn ? 'পূর্ববর্তী মালিক' : 'Previous Owner' })}
              {renderField({ name: 'current_owner', title: bn ? 'বর্তমান মালিক (দলিল অনুযায়ী)' : 'Current Owner (per deed)' })}
              {renderField({ name: 'land_class', title: t('landClass') })}
              <div className="sm:col-span-2"><label className={labelClass} htmlFor="digitize-land-description">{t('landDescription')}</label><Input id="digitize-land-description" as="textarea" rows={3} name="land_description" value={form.land_description} onChange={changeForm} className="gov-input min-h-20" /></div>
              <div className="sm:col-span-2"><label className={labelClass} htmlFor="digitize-boundary">{t('boundaryInformation')}</label><Input id="digitize-boundary" as="textarea" rows={3} name="boundary_information" value={form.boundary_information} onChange={changeForm} className="gov-input min-h-20" /></div>
            </div>

            <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
              <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold">{t('digitizationMultipleParties')}</h3><Button type="button" onClick={() => setAdditionalParties((current) => [...current, { name: '', role: 'seller', ownership_share: '' }])} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700"><Plus className="h-3.5 w-3.5" />{bn ? 'ব্যক্তি যোগ' : 'Add party'}</Button></div>
              {additionalParties.map((party, index) => <div key={index} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_160px_120px_auto] dark:border-slate-700"><Input aria-label={bn ? 'ব্যক্তির নাম' : 'Party name'} value={party.name} onChange={(event) => setAdditionalParties((current) => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} className="gov-input" placeholder={bn ? 'নাম' : 'Name'} /><Input as="select" aria-label={bn ? 'দলিলের পক্ষ' : 'Party role'} value={party.role} onChange={(event) => setAdditionalParties((current) => current.map((item, i) => i === index ? { ...item, role: event.target.value } : item))} className="gov-select"><option value="seller">{t('sellerName')}</option><option value="buyer">{t('buyerName')}</option><option value="previous_owner">{bn ? 'পূর্ববর্তী মালিক' : 'Previous Owner'}</option><option value="current_owner">{bn ? 'বর্তমান মালিক' : 'Current Owner'}</option></Input><Input type="number" min="0" max="100" step="any" aria-label={bn ? 'মালিকানার অংশ' : 'Ownership share'} value={party.ownership_share} onChange={(event) => setAdditionalParties((current) => current.map((item, i) => i === index ? { ...item, ownership_share: event.target.value } : item))} className="gov-input" placeholder="%" /><Button type="button" aria-label={bn ? 'পক্ষ সরান' : 'Remove party'} onClick={() => setAdditionalParties((current) => current.filter((_, i) => i !== index))} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></Button></div>)}
            </div>

            <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
              <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold">{t('digitizationMultipleParcels')}</h3><Button type="button" onClick={() => setAdditionalParcels((current) => [...current, { plot_id: '', khatian_no: '', mouza: '', area: '', area_unit: 'shotok', price: '', land_class: '' }])} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700"><Plus className="h-3.5 w-3.5" />{bn ? 'খণ্ড যোগ' : 'Add parcel'}</Button></div>
              {additionalParcels.map((parcel, index) => <div key={index} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700">{[['plot_id', t('plotNo')], ['khatian_no', t('khatianNo')], ['mouza', t('mouza')], ['area', t('landArea')], ['area_unit', t('areaUnit')], ['price', t('price')], ['land_class', t('landClass')]].map(([key, title]) => <Input key={key} aria-label={title} type={['area', 'price'].includes(key) ? 'number' : 'text'} min={key === 'area' ? '0.0001' : key === 'price' ? '0' : undefined} step={['area', 'price'].includes(key) ? 'any' : undefined} value={parcel[key]} onChange={(event) => setAdditionalParcels((current) => current.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item))} className="gov-input" placeholder={title} />)}<Button type="button" onClick={() => setAdditionalParcels((current) => current.filter((_, i) => i !== index))} className="justify-self-start rounded-lg p-2 text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" />{bn ? 'সরান' : 'Remove'}</Button></div>)}
            </div>

            <label className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200"><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} className="mt-0.5 accent-emerald-700" /><span>{t('digitizationReview')}<span className="mt-1 block opacity-80">{t('digitizationNotVerified')}</span></span></label>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy === 'save'} className="gov-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-60">{busy === 'save' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{busy === 'save' ? (bn ? 'আবেদন জমা হচ্ছে…' : 'Submitting application…') : editingId ? t('digitizationUpdate') : (bn ? 'আবেদন জমা দিন' : 'Submit application')}</Button>{editingId && <Button type="button" onClick={() => { setEditingId(null); setEditingEntryMethod('manual'); setForm(EMPTY_FORM); setAdditionalParties([]); setAdditionalParcels([]); setReviewConfirmed(false); setMouzaId(''); setUnionId(''); setLocationId(''); setDistrictId(''); setDivisionId(''); }} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm dark:border-slate-700">{t('digitizationCancelEdit')}</Button>}</div>
          </form>
        </section>

        <aside className="space-y-4">
          <section className="gov-card overflow-hidden p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 font-bold"><FileText className="h-4 w-4 text-emerald-700" />{bn ? 'মূল দলিলের পূর্বরূপ' : 'Original document preview'}</h2>
            {previewUrl && scanFile?.type === 'application/pdf' ? <iframe title={bn ? 'দলিল PDF পূর্বরূপ' : 'Deed PDF preview'} src={previewUrl} className="h-[360px] w-full rounded-lg border border-slate-200 dark:border-slate-700" /> : previewUrl ? <img src={previewUrl} alt={bn ? 'আপলোড করা দলিল' : 'Uploaded deed'} className="max-h-[420px] w-full rounded-lg border border-slate-200 object-contain dark:border-slate-700" /> : <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40"><UploadCloud className="mb-2 h-8 w-8 text-slate-400" />{bn ? 'স্ক্যান বা PDF বাছলে এখানে পূর্বরূপ দেখা যাবে।' : 'Choose an image or PDF to preview it here.'}</div>}
            {scanFile && <p className="mt-2 break-all text-[11px] text-slate-500">{scanFile.name}</p>}
          </section>
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"><div className="flex gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>{bn ? 'গুরুত্বপূর্ণ যাচাই নোট' : 'Verification notice'}</strong><p className="mt-1">{t('digitizationNotVerified')} {bn ? 'OCR ভুল পড়তে পারে। সঠিক তথ্যের জন্য মূল নিবন্ধিত দলিল ও সংশ্লিষ্ট অফিসের নথি যাচাই করুন।' : 'OCR can misread text. Confirm details against the registered original and the relevant office records.'}</p></div></div></section>
        </aside>
      </div>

      <section className="gov-card overflow-hidden p-4 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-bold">{isStaff ? (bn ? 'পর্যালোচনার আবেদন' : 'Applications for review') : (bn ? 'আবেদন ইতিহাস ও ট্র্যাকিং' : 'Application History & Tracking')}</h2><p className="mt-1 text-xs text-slate-500">{bn ? 'অনুমোদনের আগে আবেদন মূল deeds টেবিলে যায় না।' : 'Applications stay outside the canonical deeds table until approved.'}</p></div>{isStaff ? <Button type="button" onClick={() => loadRecords(1)} className="rounded-lg border px-3 py-2 text-xs">{bn ? 'রিফ্রেশ' : 'Refresh'}</Button> : <Button type="button" onClick={() => setActiveTab?.('mutation-track')} className="gov-btn-primary px-3 py-2 text-xs">{bn ? 'আবেদন ইতিহাস খুলুন' : 'Open application history'}</Button>}</div>
        {listError && <p role="alert" className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{listError}</p>}
        {!isStaff ? <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-900 dark:bg-emerald-950/20"><p className="text-sm font-semibold">{bn ? 'নামজারি ও দলিল ডিজিটাইজেশনের সব আবেদন এক জায়গা থেকে দেখুন।' : 'Track both Mutation and Deed Digitization applications from the centralized history page.'}</p><Button type="button" onClick={() => setActiveTab?.('mutation-track')} className="gov-btn-primary mt-3 px-4 py-2 text-xs">{bn ? 'আবেদন ইতিহাস খুলুন' : 'Open application history'}</Button></div> : records.length ? <div className="space-y-3">{records.map((record) => { const data=record.deed_data || {}; const label=applicationStatusLabel(record.status); return <article key={record.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap justify-between gap-2"><div><strong>{record.tracking_id}</strong><p className="mt-1 text-xs text-slate-500">{data.deed_no || '—'} · {data.reg_year || '—'} · {data.district || '—'} · {data.plot_id || '—'}</p>{isStaff && <p className="text-[11px] text-slate-500">{bn?'আবেদনকারী':'Applicant'}: {record.applicant_name || record.owner_user_id}{record.applicant_username ? ' · ' + record.applicant_username : ''}</p>}</div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">{label}</span></div>{user?.role === 'admin' && ['submitted','resubmitted','under_review'].includes(record.status) && <div className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-end dark:border-slate-700 dark:bg-slate-800"><label className="min-w-0 flex-1 text-xs font-medium">{bn ? 'দায়িত্বপ্রাপ্ত কর্মকর্তা' : 'Assigned officer'}<select aria-label={bn ? 'দায়িত্বপ্রাপ্ত কর্মকর্তা' : 'Assigned officer'} value={assignmentSelections[record.id] ?? (record.assigned_officer_id ? String(record.assigned_officer_id) : '')} onChange={(event) => setAssignmentSelections((previous) => ({ ...previous, [record.id]: event.target.value }))} className="gov-select mt-1 w-full"><option value="">{bn ? 'কোনো কর্মকর্তা নয়' : 'Unassigned'}</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.name || officer.username}{officer.name && officer.username ? ` (@${officer.username})` : ''}</option>)}</select></label><Button type="button" disabled={assigningId === record.id} onClick={() => assignOfficer(record)} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-60">{assigningId === record.id ? (bn ? 'সংরক্ষণ হচ্ছে…' : 'Saving…') : (bn ? 'দায়িত্ব সংরক্ষণ' : 'Save assignment')}</Button></div>}<div className="mt-3 flex flex-wrap gap-2"><Button type="button" onClick={() => viewRecord(record)} className="rounded-lg border px-3 py-1.5 text-xs">{bn?'বিস্তারিত':'Details'}</Button>{record.entry_method==='ocr' && <Button type="button" onClick={() => downloadOriginal(record)} className="rounded-lg border px-3 py-1.5 text-xs">{bn?'মূল ফাইল':'Original file'}</Button>}{!isStaff && record.status==='correction_required' && <Button type="button" onClick={() => editRecord(record)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs">{bn?'সংশোধন করে জমা':'Correct and resubmit'}</Button>}{!isStaff && ['submitted','under_review','correction_required','resubmitted'].includes(record.status) && <Button type="button" onClick={() => cancelApplication(record)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs">{bn?'আবেদন বাতিল':'Cancel'}</Button>}{isStaff && ['submitted','resubmitted','under_review'].includes(record.status) && <><Button type="button" onClick={() => decideRecord(record,'under_review')} className="rounded-lg border px-3 py-1.5 text-xs">{bn?'পর্যালোচনায় নিন':'Start review'}</Button><Button type="button" onClick={() => decideRecord(record,'correction_required')} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs">{bn?'সংশোধন চান':'Request correction'}</Button><Button type="button" onClick={() => decideRecord(record,'rejected')} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs">{bn?'প্রত্যাখ্যান':'Reject'}</Button><Button type="button" onClick={() => decideRecord(record,'cancelled')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs">{bn?'বাতিল':'Cancel'}</Button><Button type="button" onClick={() => decideRecord(record,'approved')} className="gov-btn-primary px-3 py-1.5 text-xs">{bn?'অনুমোদন ও ডিজিটাইজ':'Approve and digitize'}</Button></>}</div></article>; })}</div> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">{busy==='list'?(bn?'লোড হচ্ছে…':'Loading…'):(isStaff?(bn?'পর্যালোচনার আবেদন নেই।':'No applications awaiting review.'):(bn?'আপনার কোনো আবেদন নেই।':'You have no applications yet.'))}</div>}
        {isStaff && totalRecords>20 && <div className="mt-4 flex justify-between text-xs"><span>{totalRecords} {bn?'টি আবেদন':'applications'}</span><div className="flex gap-2"><Button type="button" disabled={page<=1} onClick={() => loadRecords(page-1)} className="rounded border px-3 py-1">{bn?'আগের':'Previous'}</Button><Button type="button" disabled={page*20>=totalRecords} onClick={() => loadRecords(page+1)} className="rounded border px-3 py-1">{bn?'পরের':'Next'}</Button></div></div>}
      </section>
      <section className="gov-card p-4 sm:p-6"><h2 className="font-bold">{isStaff?(bn?'অনুমোদিত ডিজিটাল দলিল':'Approved digital deeds'):(bn?'আমার অনুমোদিত ডিজিটাল দলিল':'My approved digital deeds')}</h2><p className="mt-1 text-xs text-slate-500">{bn?'শুধু সম্পন্ন কপি এখানে থাকবে; QR-এ সীমিত public যাচাই দেখায়।':'Only completed copies appear here; QR opens a limited public verification page.'}</p>{digitalDeeds.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{digitalDeeds.map(deed => <article key={deed.id} className="flex items-center gap-3 rounded-xl border p-3"><div className="h-24 w-24 shrink-0 bg-white p-1">{qrImages[deed.id] ? <img src={qrImages[deed.id]} alt={'QR ' + deed.digital_deed_id} className="h-full w-full"/> : <QrCode className="mx-auto mt-8 text-slate-400"/>}</div><div className="min-w-0"><strong>{deed.digital_deed_id}</strong><p className="text-xs text-slate-500">{deed.deed_no} · {deed.reg_year} · {deed.district}</p><p className="mt-1 text-[11px] text-slate-500">{deed.record_status==='revoked'?(bn?'প্রত্যাহৃত':'Revoked'):(bn?'সক্রিয়':'Active')}</p><div className="mt-2 flex flex-wrap gap-2">{!isStaff&&<><Button type="button" onClick={() => viewDigitalDeed(deed)} className="rounded border px-2 py-1 text-xs">{bn?'দেখুন':'View'}</Button><Button type="button" onClick={() => shareDigitalDeed(deed)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><Share2 className="h-3 w-3"/>{bn?'শেয়ার':'Share'}</Button><Button type="button" onClick={() => printRecord(deed)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><Printer className="h-3 w-3"/>{bn?'প্রিন্ট / PDF':'Print / PDF'}</Button></>}{user?.role==='admin'&&deed.record_status==='active'&&<Button type="button" onClick={() => revokeDigitalDeed(deed)} className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-700">{bn?'প্রত্যাহার':'Revoke'}</Button>}</div></div></article>)}</div> : <p className="mt-4 rounded border border-dashed p-6 text-center text-sm text-slate-500">{bn?'এখনও কোনো অনুমোদিত ডিজিটাল দলিল নেই।':'No approved digital deeds yet.'}</p>}</section>

      {selectedDetail && <div role="dialog" aria-modal="true" aria-label={bn?'আবেদনের বিস্তারিত':'Application details'} className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" onMouseDown={event=>{if(event.target===event.currentTarget)setSelectedDetail(null);}}><section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900 sm:p-6"><div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{selectedDetail.tracking_id}</h2><p className="mt-1 text-xs text-slate-500">{bn?'আবেদনের অবস্থা':'Application status'}: {applicationStatusLabel(selectedDetail.status)}</p></div><Button type="button" onClick={()=>setSelectedDetail(null)} className="rounded-lg border px-3 py-1.5">×</Button></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[[t('deedNo'),selectedDetail.deed_data?.deed_no],[t('regYear'),selectedDetail.deed_data?.reg_year],[t('deedType'),selectedDetail.deed_data?.deed_type],[t('regDate'),selectedDetail.deed_data?.reg_date],[t('subRegistryOffice'),selectedDetail.deed_data?.sub_registry_office],[bn?'বিভাগ':'Division',selectedDetail.deed_data?.division],[t('district'),selectedDetail.deed_data?.district],[t('upazila'),selectedDetail.deed_data?.upazila],[t('mouza'),selectedDetail.deed_data?.mouza],[bn?'ইউনিয়ন / ওয়ার্ড':'Union / Ward',selectedDetail.deed_data?.union_ward],[t('plotNo'),selectedDetail.deed_data?.plot_id],[t('khatianNo'),selectedDetail.deed_data?.khatian_no],[t('sellerName'),selectedDetail.deed_data?.seller_name],[t('buyerName'),selectedDetail.deed_data?.buyer_name],[t('landArea'),selectedDetail.deed_data?.area],[t('price'),selectedDetail.deed_data?.price]].filter(([,value])=>value!==null&&value!==undefined&&value!=='').map(([title,value])=><div key={title} className="rounded-lg border p-3"><p className="text-[11px] text-slate-500">{title}</p><p className="mt-1 break-words text-sm font-semibold">{value}</p></div>)}</div><div className="mt-4 flex flex-wrap gap-2">{(selectedDetail.documents||[]).map(doc=><Button key={doc.id} type="button" onClick={()=>downloadOriginal(selectedDetail,doc.id)} className="rounded-lg border px-3 py-1.5 text-xs">{bn?'মূল ফাইল দেখুন':'Open original'} · {doc.original_filename}</Button>)}{!isStaff&&!['completed','rejected','cancelled'].includes(selectedDetail.status)&&<label className="cursor-pointer rounded-lg border border-emerald-300 px-3 py-1.5 text-xs text-emerald-800">{busy==='document'?(bn?'আপলোড হচ্ছে…':'Uploading…'):(bn?'আরও ফাইল যোগ করুন':'Attach another file')}<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" disabled={busy==='document'} onChange={event=>{const file=event.target.files?.[0];if(file)addApplicationDocument(selectedDetail.id,file);event.target.value='';}}/></label>}{!isStaff&&selectedDetail.status==='correction_required'&&<Button type="button" onClick={()=>editRecord(selectedDetail)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs">{bn?'সংশোধন করুন':'Edit correction'}</Button>}</div><h3 className="mt-5 text-sm font-bold">{bn?'আবেদনের অগ্রগতি':'Application timeline'}</h3><ol className="mt-2 space-y-2">{(selectedDetail.history||[]).map((item,index)=><li key={index} className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800"><strong>{applicationStatusLabel(item.to_status)}</strong><span className="ml-2 text-slate-500">{new Date(item.created_at).toLocaleString()}</span>{item.note&&<p className="mt-1">{item.note}</p>}</li>)}</ol><h3 className="mt-5 text-sm font-bold">{bn?'মূল OCR পাঠ্য':'OCR text from the document'}</h3><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-relaxed dark:bg-slate-800">{selectedDetail.ocr_text|| (bn?'কোনো OCR পাঠ্য নেই।':'No OCR text is available.')}</pre><p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{bn?'কর্মকর্তার আবেদন-অনুমোদন সরকারি নিবন্ধন বা মালিকানার চূড়ান্ত প্রমাণ নয়।':'Internal application approval is not final proof of government registration or ownership.'}</p></section></div>}

      {selectedPrint && <article className="deed-print-card hidden">
        <div className="border-b-2 border-emerald-700 pb-4 text-center"><p className="text-sm font-bold text-emerald-800">{bn ? 'ভূমিসেতু · ডিজিটাল ভূমি সেবা' : 'Bhumisetu · Digital Land Services'}</p><h1 className="mt-2 text-2xl font-bold">{bn ? 'ডিজিটাইজড দলিলের অনুলিপি' : 'Digitized Deed Copy'}</h1><p className="mt-2 text-xs font-semibold text-rose-700">{t('digitizationNotOfficial')}</p></div>
        <p className="mt-4 text-xs">{bn ? 'ডিজিটাল দলিল আইডি' : 'Digital deed ID'}: {selectedPrint.digital_deed_id} · {bn ? 'তৈরির তারিখ' : 'Issued'}: {new Date(selectedPrint.digitized_at).toLocaleString()}</p>
        {selectedPrint.qr_data_url && <div className="mt-4 flex items-center gap-3 border-b border-slate-200 pb-3"><img src={selectedPrint.qr_data_url} alt={bn ? 'ডিজিটাল দলিল যাচাই QR' : 'Digital deed verification QR'} className="h-24 w-24"/><p className="break-all text-xs">{bn ? 'সীমিত public যাচাই' : 'Limited public verification'}: {selectedPrint.verification_url}</p></div>}
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">{[[t('deedNo'), selectedPrint.deed_no], [t('deedType'), deedTypes.find((item) => item.code === selectedPrint.deed_type)?.[bn ? 'name_bn' : 'name_en'] || selectedPrint.deed_type], [t('regDate'), selectedPrint.reg_date], [t('subRegistryOffice'), selectedPrint.sub_registry_office], [bn ? 'বিভাগ' : 'Division', selectedPrint.division], [t('district'), selectedPrint.district], [t('upazila'), selectedPrint.upazila], [t('mouza'), selectedPrint.mouza], [bn ? 'ইউনিয়ন / ওয়ার্ড' : 'Union / Ward', selectedPrint.union_ward], [t('plotNo'), selectedPrint.plot_id], [t('khatianNo'), selectedPrint.khatian_no], [t('sellerName'), selectedPrint.seller_name], [t('buyerName'), selectedPrint.buyer_name], [t('landArea'), `${selectedPrint.area} ${selectedPrint.supplemental_fields?.area_unit || ''}`], [t('price'), selectedPrint.price], [t('landClass'), selectedPrint.supplemental_fields?.land_class], [t('landDescription'), selectedPrint.supplemental_fields?.land_description], [t('boundaryInformation'), selectedPrint.supplemental_fields?.boundary_information]].filter(([, value]) => value !== null && value !== undefined && value !== '').map(([title, value]) => <div key={title} className="border-b border-slate-200 py-2"><p className="text-xs text-slate-500">{title}</p><p className="mt-1 font-semibold">{value}</p></div>)}</div>
        {(selectedPrint.additional_parties || []).length > 0 && <section className="mt-5"><h2 className="font-bold">{t('digitizationMultipleParties')}</h2>{selectedPrint.additional_parties.map((party, index) => <p key={index} className="mt-1 text-sm">{party.name} · {party.role}{party.ownership_share != null ? ` · ${party.ownership_share}%` : ''}</p>)}</section>}
        {(selectedPrint.additional_parcels || []).length > 0 && <section className="mt-5"><h2 className="font-bold">{t('digitizationMultipleParcels')}</h2>{selectedPrint.additional_parcels.map((parcel, index) => <p key={index} className="mt-1 text-sm">{parcel.plot_id || '—'} · {parcel.khatian_no || '—'} · {parcel.mouza || selectedPrint.mouza}{parcel.area ? ` · ${parcel.area} ${parcel.area_unit || ''}` : ''}</p>)}</section>}
        <p className="mt-5 text-xs text-slate-600">{bn ? 'মূল স্ক্যান' : 'Original scan'}: {selectedPrint.original_document_path ? (bn ? 'সংরক্ষিত' : 'Preserved') : (bn ? 'সংযুক্ত নেই' : 'Not attached')}</p>
        <div className="mt-6 border-t border-slate-300 pt-3 text-xs text-slate-600">{bn ? 'এই কপি অ্যাপের সংরক্ষিত তথ্যের অনুলিপি। সরকারি সনদ, নিবন্ধন, বালাম বা মালিকানা যাচাই হিসেবে ব্যবহারযোগ্য নয়।' : 'This copy reproduces information stored in the application. It is not an official certificate, registration, volume-book record, or ownership verification.'}</div>
      </article>}
    </div>
  );
}

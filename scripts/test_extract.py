import importlib.util
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import fitz

spec=importlib.util.spec_from_file_location('extract',Path(__file__).with_name('extract.py'))
extract=importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)

class ExtractionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
    def tearDown(self): self.temp.cleanup()
    def pdf(self,text,scanned=False):
        d=fitz.open();p=d.new_page();p.insert_text((50,50),text,fontsize=13)
        if scanned:
            png=p.get_pixmap(matrix=fitz.Matrix(2,2)).tobytes('png')
            d.close();d=fitz.open();p=d.new_page();p.insert_image(p.rect,stream=png)
        path=self.root/'profile.pdf';d.save(path);d.close();return str(path)
    def native(self,text):
        with patch.object(extract,'ocr_page',return_value=[]):return extract.extract_pdf(self.pdf(text))
    def test_personal_fields_and_evidence(self):
        x=self.native("Name: Ayu Test\nDate of birth: 30/07/1995\nNationality: Indonesian\nMarital status: Single\nReligion: Muslim\nEducation level: Secondary\nHeight: 155 cm\nWeight: 52 kg\nNumber of siblings: 3\nNumber of children: 2\nAge(s) of children (if any): 3, 7\nEnglish: conversational\nSalary: S$650\nRest days per month: 4\nCooking: Indian, Chinese")
        f=x['fields'];self.assertEqual(f['name'],'Ayu Test');self.assertEqual(f['dob'],'1995-07-30');self.assertEqual(f['height_cm'],155);self.assertEqual(f['weight_kg'],52);self.assertEqual(f['children'],[3,7]);self.assertEqual(f['salary'],650);self.assertEqual(f['english'],'conversational');self.assertEqual(f['cooking'],['Indian','Chinese']);self.assertEqual(x['evidence']['nationality']['page'],1)
    def test_boxes_are_read_as_digits(self):
        f=self.native('Name: Box Test\nDate of birth: 3 0 0 7 0 3 Age: 2 3\nHeight & weight: 1 4 9 cm 5 1 kg')['fields']
        self.assertEqual(f['dob'],'2003-07-30');self.assertEqual(f['age'],23);self.assertEqual(f['height_cm'],149);self.assertEqual(f['weight_kg'],51)
    def test_missing_fields_are_not_guessed_from_filename_or_marital_status(self):
        f=self.native('Name: Example Person\nMarital status: Single\nNumber of children:\nSalary:\nLanguage abilities: Bahasa')['fields']
        for key in ['childrenCount','english','salary','dob']:self.assertNotIn(key,f)
    def test_employment_and_overlap_duration(self):
        f=self.native('Name: History Test\nEmployment History\n2020 2024 Singapore Care of 6 months old baby\n2022 2025 Indonesia Childcare')['fields']
        self.assertEqual(len(f['jobs']),2);self.assertEqual(f['years'],5);self.assertEqual(f['workLocation'],'ex-sg');self.assertIn('Infant',f['care'])
    def test_willingness_is_not_work_experience(self):
        f=self.native('Name: Willing Test\nSKILLS OF FDW\n1. Care of infants/children\nYes No\nWilling to learn\n2. Care of elderly\nYes No\nWilling to take care')['fields']
        self.assertNotIn('care',f);self.assertEqual(f['willingness']['Child'],True);self.assertIsNone(f['careEvidence']['Infant'])
    @unittest.skipUnless(shutil.which('tesseract'),'Tesseract not installed')
    def test_scanned_pdf_uses_real_ocr(self):
        x=extract.extract_pdf(self.pdf('Name: Scan Test\nNationality: Indonesian\nHeight: 156 cm\nWeight: 53 kg\nEnglish: basic',scanned=True))
        self.assertEqual(x['fields']['name'],'Scan Test');self.assertEqual(x['fields']['height_cm'],156);self.assertEqual(x['evidence']['name']['method'],'OCR');self.assertTrue(x['scanned'])
    def test_missing_ocr_reports_limitation_and_keeps_native_data(self):
        with patch.object(extract.shutil,'which',return_value=None):x=extract.extract_pdf(self.pdf('Name: Native Test'))
        self.assertEqual(x['fields']['name'],'Native Test');self.assertTrue(any('Install Tesseract' in w for w in x['warnings']))

if __name__=='__main__':unittest.main(verbosity=2)

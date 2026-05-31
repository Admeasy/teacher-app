-- Normalize emails (trim + lowercase) and trim IDs across teacher/student records.
UPDATE public.teachers
SET email = lower(btrim(email))
WHERE email IS NOT NULL AND email <> lower(btrim(email));

UPDATE public.teachers
SET teacher_id = btrim(teacher_id)
WHERE teacher_id IS NOT NULL AND teacher_id <> btrim(teacher_id);

UPDATE public.students
SET parent_email = lower(btrim(parent_email))
WHERE parent_email IS NOT NULL AND parent_email <> lower(btrim(parent_email));

UPDATE public.students
SET student_email = lower(btrim(student_email))
WHERE student_email IS NOT NULL AND student_email <> lower(btrim(student_email));

UPDATE public.students
SET student_id = btrim(student_id)
WHERE student_id IS NOT NULL AND student_id <> btrim(student_id);

UPDATE public.non_teaching_staff
SET email = lower(btrim(email))
WHERE email IS NOT NULL AND email <> lower(btrim(email));
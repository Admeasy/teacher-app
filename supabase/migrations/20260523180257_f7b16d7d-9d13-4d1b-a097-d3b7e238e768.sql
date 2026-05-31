
-- Explicit deny policies so intent is clear (service role still bypasses RLS)
CREATE POLICY "deny all sa" ON public.student_accounts FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "deny all so" ON public.student_otps     FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE INDEX "audit_trails_company_id_idx" ON "audit_trails" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "audit_trails_created_at_idx" ON "audit_trails" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_trails_user_id_idx" ON "audit_trails" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "document_access_logs_document_version_id_idx" ON "document_access_logs" USING btree ("document_version_id");--> statement-breakpoint
CREATE INDEX "document_access_logs_company_id_idx" ON "document_access_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "service_assignments_company_id_idx" ON "service_assignments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "service_assignments_contract_id_idx" ON "service_assignments" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "service_assignments_employee_id_idx" ON "service_assignments" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "service_assignments_created_by_idx" ON "service_assignments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "service_assignment_team_company_id_idx" ON "service_assignment_team" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "service_assignment_team_assignment_id_idx" ON "service_assignment_team" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "service_assignment_team_employee_id_idx" ON "service_assignment_team" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "witnessed_audit_evaluations_company_id_idx" ON "witnessed_audit_evaluations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "witnessed_audit_evaluations_assignment_id_idx" ON "witnessed_audit_evaluations" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "witnessed_audit_evaluations_observer_employee_id_idx" ON "witnessed_audit_evaluations" USING btree ("observer_employee_id");--> statement-breakpoint
CREATE INDEX "performance_evaluations_company_id_idx" ON "performance_evaluations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "performance_evaluations_assignment_id_idx" ON "performance_evaluations" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "performance_evaluations_evaluator_employee_id_idx" ON "performance_evaluations" USING btree ("evaluator_employee_id");